# services/backend_service.py
import os
import sys
import ctypes
import io
import json
import argparse
import atexit
import base64
import re
import zipfile
import subprocess
from PIL import Image

# 解决 OpenMP 冲突
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

# 解决 Windows 编码
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    sys.stdout = io.TextIOWrapper(
        sys.stdout.buffer, encoding="utf-8", line_buffering=True
    )
    sys.stderr = io.TextIOWrapper(
        sys.stderr.buffer, encoding="utf-8", line_buffering=True
    )

# 导入业务模块
from modules.utils import log_message, send_response
from modules.text_detection import DetectionModuleManager, TextDetectorRegistry
from modules.translator import (
    DEFAULT_TRANSLATOR_ID,
    get_translator_engine,
    list_translator_models,
    normalize_translator_id,
    requires_translate_worker,
)


def preload_openmp_for_ocr():
    if not getattr(sys, "frozen", False):
        return

    base_dir = os.path.dirname(sys.executable)
    omp_candidates = [
        os.path.join(base_dir, "_internal", "torch", "lib", "libiomp5md.dll"),
        os.path.join(base_dir, "_internal", "libiomp5md.dll"),
        os.path.join(base_dir, "libiomp5md.dll"),
    ]
    omp_path = next((path for path in omp_candidates if os.path.exists(path)), None)
    if not omp_path:
        return

    try:
        torch_lib_dir = os.path.dirname(omp_path)
        os.environ["PATH"] = torch_lib_dir + os.pathsep + os.environ.get("PATH", "")
        try:
            os.add_dll_directory(torch_lib_dir)
        except Exception:
            pass
        ctypes.CDLL(omp_path, winmode=0)
        log_message(f"[DEBUG] Pre-loaded OpenMP for OCR: {omp_path}")
    except Exception as e:
        log_message(f"[DEBUG] Failed to pre-load OpenMP for OCR: {e}")


def run_translate_worker_mode(models_root):
    try:
        encoded = sys.stdin.readline().strip()
        payload = json.loads(base64.b64decode(encoded).decode("utf-8"))
        text = payload.get("text", "")
        model_id = payload.get("model_id") or payload.get("modelId")
        selected_model_id = normalize_translator_id(model_id)
        if selected_model_id == "opus-mt-ja-zh":
            preload_openmp_for_ocr()
        translation_root = os.path.join(models_root, "translation")
        translator = get_translator_engine(selected_model_id, translation_root)

        if not translator.check_model_exists():
            raise Exception("MODEL_NOT_FOUND")

        translator.initialize()
        if not translator.is_ready:
            raise Exception("TRANSLATOR_NOT_READY")

        result = translator.translate(text)
        send_response(
            {
                "success": True,
                "translation": result,
                "model_id": selected_model_id,
            }
        )
        return 0
    except Exception as e:
        import traceback

        log_message(f"[ERROR] Translate worker failed: {e}")
        log_message(f"[ERROR] Traceback: {traceback.format_exc()}")
        send_response({"success": False, "error": str(e)})
        return 1


def run_detection_worker_mode(modules_root):
    manager = DetectionModuleManager(modules_root)
    registry = TextDetectorRegistry(manager)
    try:
        for line in sys.stdin:
            request = {}
            try:
                request = json.loads(line)
                worker_id = request.get("worker_id")
                action = request.get("action")
                if action == "load":
                    result = {"version": registry.load()}
                elif action == "detect":
                    result = {"regions": registry.detect_base64(request.get("image", ""))}
                elif action == "shutdown":
                    send_response({"worker_id": worker_id, "success": True})
                    return 0
                else:
                    raise ValueError(f"UNKNOWN_DETECTION_WORKER_ACTION: {action}")
                send_response({"worker_id": worker_id, "success": True, **result})
            except Exception as error:
                send_response(
                    {
                        "worker_id": request.get("worker_id") if isinstance(request, dict) else None,
                        "success": False,
                        "error": str(error),
                    }
                )
    finally:
        registry.unload()
    return 0


class DetectionWorkerClient:
    def __init__(self, modules_root):
        self.modules_root = modules_root
        self.process = None
        self.next_request_id = 1

    def load(self):
        return self._request("load").get("version", "")

    def detect_base64(self, image_base64):
        return self._request("detect", image=image_base64).get("regions", [])

    def unload(self):
        process = self.process
        self.process = None
        if process is None:
            return
        try:
            if process.poll() is None:
                request = {"worker_id": self.next_request_id, "action": "shutdown"}
                process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
                process.stdin.flush()
                process.wait(timeout=10)
        except Exception:
            process.kill()
            process.wait(timeout=10)
        finally:
            for stream in (process.stdin, process.stdout):
                if stream:
                    stream.close()

    def _start(self):
        if self.process is not None and self.process.poll() is None:
            return
        command = [sys.executable]
        if not getattr(sys, "frozen", False):
            command.append(os.path.abspath(__file__))
        command.extend(
            ["--detection-worker", "--modules-root", str(self.modules_root)]
        )
        self.process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=(
                subprocess.CREATE_NO_WINDOW
                if hasattr(subprocess, "CREATE_NO_WINDOW")
                else 0
            ),
        )

    def _request(self, action, **payload):
        self._start()
        worker_id = self.next_request_id
        self.next_request_id += 1
        request = {"worker_id": worker_id, "action": action, **payload}
        try:
            self.process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
            self.process.stdin.flush()
            while True:
                line = self.process.stdout.readline()
                if not line:
                    raise RuntimeError("DETECTION_WORKER_STOPPED")
                try:
                    response = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if response.get("worker_id") != worker_id:
                    continue
                if not response.get("success"):
                    raise RuntimeError(response.get("error") or "DETECTION_WORKER_FAILED")
                return response
        except Exception:
            self.unload()
            raise


def translate_in_worker(models_root, model_id, text, timeout=600):
    payload = {"model_id": model_id, "text": text}
    encoded = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    command = [
        sys.executable,
        "--translate-worker",
        "--models-root",
        models_root,
    ]

    completed = subprocess.run(
        command,
        input=encoded + "\n",
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )

    if completed.stderr:
        for line in completed.stderr.splitlines():
            log_message(f"[Translate Worker] {line}")

    response = None
    for line in completed.stdout.splitlines():
        try:
            parsed = json.loads(line)
        except Exception:
            continue
        if "success" in parsed:
            response = parsed

    if response is None:
        raise Exception(
            f"TRANSLATE_WORKER_NO_RESPONSE: exit={completed.returncode}"
        )
    if not response.get("success"):
        raise Exception(response.get("error") or "TRANSLATE_WORKER_FAILED")
    return response.get("translation", ""), response.get("model_id") or model_id


def should_translate_in_worker(model_id):
    if os.environ.get("MANGAREADER_TRANSLATE_WORKER") != "1":
        return False
    return getattr(sys, "frozen", False) and requires_translate_worker(model_id)

# --- Helper Functions for Cover Extraction ---


def atoi(text):
    return int(text) if text.isdigit() else text


def natural_keys(text):
    """
    alist.sort(key=natural_keys) sorts in human order
    http://nedbatchelder.com/blog/200712/human_sorting.html
    """
    return [atoi(c) for c in re.split(r"(\d+)", text.lower())]


def resize_image(img_data, max_height=300):
    try:
        image = Image.open(io.BytesIO(img_data))

        # Convert to RGB (in case of RGBA or CMYK) to save as JPEG
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")

        # Calculate new size
        width, height = image.size
        if height > max_height:
            ratio = max_height / height
            new_width = int(width * ratio)
            new_height = max_height
            image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)

        # Save to buffer
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=85)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")
    except Exception as e:
        log_message(f"Error resizing image: {e}")
        return None


def extract_cover_image(path):
    """
    Extracts the first image from a folder or ZIP file and returns it as a Base64 string.
    Uses natural sorting to ensure '1.jpg' comes before '10.jpg'.
    """
    allowed_exts = (".jpg", ".jpeg", ".png", ".webp", ".bmp")

    try:
        if os.path.isdir(path):
            files = [f for f in os.listdir(path) if not f.startswith(".")]
            # Use natural sort
            try:
                files.sort(key=natural_keys)
            except Exception as sort_err:
                log_message(f"Natural sort failed, using default sort: {sort_err}")
                files.sort()

            # Log first few files to debug sort order
            log_message(f"Cover candidates for {path}: {files[:3]}")

            for f in files:
                if f.lower().endswith(allowed_exts):
                    full_path = os.path.join(path, f)
                    try:
                        with open(full_path, "rb") as image_file:
                            return resize_image(image_file.read())
                    except Exception as img_err:
                        log_message(f"Failed to read image {f}: {img_err}")
                        continue

        elif zipfile.is_zipfile(path):
            with zipfile.ZipFile(path, "r") as zip_ref:
                file_list = zip_ref.namelist()
                file_list.sort(key=natural_keys)

                for file_name in file_list:
                    # Ignore directories in zip
                    if file_name.endswith("/"):
                        continue
                    if file_name.lower().endswith(allowed_exts):
                        try:
                            with zip_ref.open(file_name) as file:
                                return resize_image(file.read())
                        except Exception as img_err:
                            log_message(
                                f"Failed to read zip entry {file_name}: {img_err}"
                            )
                            continue

    except Exception as e:
        log_message(f"Failed to extract cover from {path}: {str(e)}")
        return None
    return None


def main():
    log_message("Starting Backend Service (v2025.12.04-FixEncoding)...")

    send_response({"type": "init_status", "message": "正在启动后台服务..."})

    # 1. 解析参数
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=str, help="Path to OCR model")
    parser.add_argument("--models-root", type=str, help="Path to models root")
    parser.add_argument("--modules-root", type=str, help="Path to writable service modules")
    parser.add_argument(
        "--download-source", choices=("mirror", "official"), default="mirror"
    )
    parser.add_argument("--translate-worker", action="store_true")
    parser.add_argument("--detection-worker", action="store_true")
    args, _ = parser.parse_known_args()

    # 修复：如果未提供 --model-dir，则使用默认路径 (防止 NoneType 错误)
    if args.models_root:
        models_root = args.models_root
    elif args.model_dir:
        models_root = os.path.dirname(args.model_dir)
    else:
        # 默认情况下，假设 models 在当前目录或上级目录
        # In packaged mode models usually live under resources/models.
        if getattr(sys, "frozen", False):
            # Fallback for backends launched from a models sibling directory.
            models_root = os.path.join(os.path.dirname(sys.executable), "models")
        else:
            models_root = os.path.join(os.getcwd(), "models")

    if args.translate_worker:
        sys.exit(run_translate_worker_mode(models_root))

    modules_root = args.modules_root or os.path.join(
        os.path.dirname(models_root), "services", "modules"
    )
    if args.detection_worker:
        sys.exit(run_detection_worker_mode(modules_root))

    preload_openmp_for_ocr()

    translation_root = os.path.join(models_root, "translation")
    dictionary_root = os.path.join(models_root, "dictionary", "sudachi")
    if not os.path.exists(translation_root):
        os.makedirs(translation_root, exist_ok=True)

    # [CRITICAL] Instantiate the default translator first. For llama.cpp engines this keeps
    # the old load order without initializing model weights at startup.
    send_response({"type": "init_status", "message": "正在预加载翻译引擎组件..."})
    translators = {}
    current_translator_id = DEFAULT_TRANSLATOR_ID
    translator = None

    def get_or_create_translator(model_id=None):
        normalized_id = normalize_translator_id(model_id)
        if normalized_id not in translators:
            translators[normalized_id] = get_translator_engine(
                normalized_id, translation_root
            )
        return normalized_id, translators[normalized_id]

    def select_translator(model_id=None):
        nonlocal current_translator_id, translator
        normalized_id, engine = get_or_create_translator(model_id)
        if translator is not None and translator is not engine and translator.is_ready:
            translator.unload()
        current_translator_id = normalized_id
        translator = engine
        return normalized_id, engine

    try:
        log_message(f"Init Translator ({DEFAULT_TRANSLATOR_ID}) root: {translation_root}")
        select_translator(DEFAULT_TRANSLATOR_ID)

    except Exception as e:
        log_message(f"[WARNING] Translator Pre-init Failed (Non-fatal): {e}")

    # 初始化OCR
    send_response(
        {
            "type": "init_status",
            "message": "正在加载 OCR 引擎 (首次运行可能需要下载模型)...",
        }
    )
    try:
        from modules.ocr_engine import OCREngine

        # Ensure the OCR model path is valid.
        if args.model_dir:
            ocr_model_path = args.model_dir
        else:
            ocr_model_path = os.path.join(models_root, "ocr")

        ocr_engine = OCREngine(
            model_dir=ocr_model_path, download_source=args.download_source
        )
    except Exception as e:
        log_message(f"[ERROR] OCR Init Failed: {e}")
        send_response(
            {
                "type": "init_error",
                "message": f"OCR 模型加载失败: {str(e)}",
                "detail": "请检查网络连接，或尝试手动下载模型。",
                "can_retry_download": bool(
                    getattr(e, "all_sources_failed", False)
                ),
            }
        )
        sys.exit(1)

    from modules.sudachi_dictionary import SudachiDictionaryManager
    from modules.tokenizer import JapaneseTokenizer

    dictionary_manager = SudachiDictionaryManager(dictionary_root)
    tokenizer = None
    detection_manager = DetectionModuleManager(modules_root)
    detection_registry = DetectionWorkerClient(modules_root)
    atexit.register(detection_registry.unload)

    # [MODIFIED] Translator is already instantiated above for pre-loading.
    # We just need to ensure it's assigned to the variable we use later.
    if translator is None:
        select_translator(DEFAULT_TRANSLATOR_ID)

    # 准备就绪
    send_response({"type": "init_status", "message": "资源加载完毕，即将进入..."})
    send_response({"status": "ready"})
    log_message("Waiting for commands...")

    # 4. 消息循环
    import base64

    for line in sys.stdin:
        try:
            line = line.strip()
            if not line:
                continue

            # [Fix Encoding] 解码 Base64
            try:
                # 1. Base64 -> Bytes (UTF-8)
                json_bytes = base64.b64decode(line)
                # 2. Bytes -> String
                json_str = json_bytes.decode("utf-8")
                # 3. Parse JSON
                request = json.loads(json_str)
            except Exception as e:
                log_message(f"[CRITICAL] Failed to decode Base64 payload: {e}")
                # Try raw JSON for compatibility with old callers.
                try:
                    request = json.loads(line)
                except:
                    continue

            req_id = request.get("id")
            command = request.get("command")

            # === 路由分发 ===

            # -> OCR 任务
            if command == "recognize":
                try:
                    text = ocr_engine.recognize(request.get("image", ""))
                    send_response({"id": req_id, "success": True, "text": text})
                except Exception as e:
                    send_response({"id": req_id, "success": False, "error": str(e)})

            # -> 分词任务
            elif command == "tokenize":
                try:
                    text = request.get("text", "")
                    log_message(f"Processing tokenize request for: {repr(text)}")
                    if not dictionary_manager.check_exists():
                        raise Exception("DICTIONARY_NOT_FOUND")
                    if tokenizer is None:
                        tokenizer = JapaneseTokenizer(dictionary_manager.dictionary_path)
                    tokens = tokenizer.tokenize(text)
                    send_response({"id": req_id, "success": True, "tokens": tokens})
                except Exception as e:
                    log_message(f"Tokenize Error: {e}")
                    send_response({"id": req_id, "success": False, "error": str(e)})

            # --- Translate ---
            elif command == "translate":
                try:
                    text = request.get("text", "")
                    model_id = request.get("model_id") or request.get("modelId")
                    selected_model_id = normalize_translator_id(model_id)
                    log_message(
                        f"[DEBUG] Processing translate request with {selected_model_id}: {repr(text)[:50]}..."
                    )

                    if should_translate_in_worker(selected_model_id):
                        log_message("[DEBUG] Using isolated translate worker in packaged mode...")
                        current_translator_id = selected_model_id
                        result, worker_model_id = translate_in_worker(
                            models_root, selected_model_id, text
                        )
                        log_message(f"[DEBUG] Translation result: {repr(result)[:50]}...")
                        send_response(
                            {
                                "id": req_id,
                                "success": True,
                                "translation": result,
                                "model_id": worker_model_id,
                            }
                        )
                        continue

                    selected_model_id, selected_translator = select_translator(
                        selected_model_id
                    )

                    # 1. 检查是否已加载
                    if not selected_translator.is_ready:
                        log_message(
                            "[DEBUG] Translator not ready. Checking model existence..."
                        )
                        # Check physical model files before lazy loading.
                        if selected_translator.check_model_exists():
                            # Load the model only when it is first used.
                            log_message(
                                "[DEBUG] Model exists. Initializing translator..."
                            )
                            selected_translator.initialize()
                        else:
                            log_message("[ERROR] Model not found.")
                            raise Exception("MODEL_NOT_FOUND")

                    # 3. 执行翻译
                    log_message("[DEBUG] Executing translator.translate()...")
                    result = selected_translator.translate(text)
                    log_message(f"[DEBUG] Translation result: {repr(result)[:50]}...")
                    send_response(
                        {
                            "id": req_id,
                            "success": True,
                            "translation": result,
                            "model_id": selected_model_id,
                        }
                    )

                except Exception as e:
                    # Capture errors, including MODEL_NOT_FOUND above.
                    log_message(f"[ERROR] Translation Error: {e}")
                    import traceback

                    log_message(f"[ERROR] Traceback: {traceback.format_exc()}")
                    send_response({"id": req_id, "success": False, "error": str(e)})

            # --- Model Management (New) ---

            elif command == "list_translation_models":
                send_response(
                    {
                        "id": req_id,
                        "success": True,
                        "models": list_translator_models(),
                        "default_model_id": DEFAULT_TRANSLATOR_ID,
                        "current_model_id": current_translator_id,
                    }
                )

            # 1. Check model status.
            elif command == "check_model":
                model_id = request.get("model_id") or request.get("modelId")
                selected_model_id, selected_translator = get_or_create_translator(model_id)
                exists = selected_translator.check_model_exists()
                send_response(
                    {
                        "id": req_id,
                        "success": True,
                        "exists": exists,
                        "model_id": selected_model_id,
                    }
                )

            # 2. 下载模型
            elif command == "download_model":
                try:
                    model_id = request.get("model_id") or request.get("modelId")
                    selected_model_id, selected_translator = get_or_create_translator(model_id)
                    selected_translator.download_model()
                    # Download only verifies file integrity; translation lazy-loads weights.
                    if not selected_translator.check_model_exists():
                        raise Exception("MODEL_INSTALL_FAILED")
                    send_response(
                        {
                            "id": req_id,
                            "success": True,
                            "model_id": selected_model_id,
                        }
                    )
                except Exception as e:
                    send_response({"id": req_id, "success": False, "error": str(e)})

            # 3. 删除模型
            elif command == "delete_model":
                model_id = request.get("model_id") or request.get("modelId")
                selected_model_id, selected_translator = get_or_create_translator(model_id)
                success = selected_translator.delete_model()
                send_response(
                    {
                        "id": req_id,
                        "success": success,
                        "model_id": selected_model_id,
                    }
                )

            elif command == "check_detection_module":
                send_response(
                    {
                        "id": req_id,
                        "success": True,
                        **detection_manager.get_status(verify_integrity=True),
                    }
                )

            elif command == "download_detection_module":
                try:
                    def report_detection_progress(progress):
                        send_response(
                            {"type": "detection_module_download_progress", **progress}
                        )

                    detection_registry.unload()
                    status = detection_manager.install(
                        report_detection_progress,
                        request.get("download_source", "mirror"),
                    )
                    try:
                        detection_registry.load()
                    except Exception:
                        detection_registry.unload()
                        detection_manager.delete()
                        raise
                    send_response({"id": req_id, "success": True, **status})
                except Exception as e:
                    send_response({"id": req_id, "success": False, "error": str(e)})

            elif command == "delete_detection_module":
                try:
                    detection_registry.unload()
                    detection_manager.delete()
                    send_response({"id": req_id, "success": True})
                except Exception as e:
                    send_response({"id": req_id, "success": False, "error": str(e)})

            elif command == "detect_text_regions":
                try:
                    regions = detection_registry.detect_base64(
                        request.get("image", "")
                    )
                    send_response(
                        {"id": req_id, "success": True, "regions": regions}
                    )
                except Exception as e:
                    send_response({"id": req_id, "success": False, "error": str(e)})

            # 4. 提取封面 (New)
            elif command == "check_dictionary":
                exists = dictionary_manager.check_exists()
                send_response({"id": req_id, "success": True, "exists": exists})

            elif command == "download_dictionary":
                try:
                    dictionary_manager.download()
                    tokenizer = JapaneseTokenizer(dictionary_manager.dictionary_path)
                    send_response({"id": req_id, "success": True})
                except Exception as e:
                    tokenizer = None
                    send_response({"id": req_id, "success": False, "error": str(e)})

            elif command == "delete_dictionary":
                tokenizer = None
                success = dictionary_manager.delete()
                send_response({"id": req_id, "success": success})

            elif command == "extract_cover":
                try:
                    path_arg = request.get("path", "")
                    log_message(f"Extracting cover from: {path_arg}")
                    cover_base64 = extract_cover_image(path_arg)
                    if cover_base64:
                        send_response(
                            {"id": req_id, "success": True, "cover": cover_base64}
                        )
                    else:
                        send_response(
                            {"id": req_id, "success": False, "error": "No image found"}
                        )
                except Exception as e:
                    log_message(f"Extract Cover Error: {e}")
                    send_response({"id": req_id, "success": False, "error": str(e)})

            elif command == "ping":
                send_response({"success": True, "message": "pong"})

            elif command == "exit":
                detection_registry.unload()
                sys.exit(0)

        except json.JSONDecodeError:
            log_message("Received invalid JSON")
        except Exception as e:
            log_message(f"Critical Loop Error: {e}")


if __name__ == "__main__":
    main()
