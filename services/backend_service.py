# services/backend_service.py
import os
import sys
import ctypes
import io
import json
import argparse
import base64
import re
import zipfile
from PIL import Image

# --- 1. 锁定运行目录 & 强制手动加载 DLL (Fix Error 126 & 1114) ---
if getattr(sys, "frozen", False):
    base_dir = os.path.dirname(sys.executable)

    # Pre-load OpenMP (libiomp5md.dll) if present in root
    # This is still needed to prevent torch from loading its own incompatible version
    omp_path = os.path.join(base_dir, "libiomp5md.dll")
    if os.path.exists(omp_path):
        try:
            ctypes.CDLL(omp_path, winmode=0)
            print(f"DEBUG: Pre-loaded OpenMP: {omp_path}")
        except Exception as e:
            print(f"DEBUG: Failed to pre-load OpenMP: {e}")

# 解决 OpenMP 冲突
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

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
from modules.translator import get_translator_engine

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

    # 发送状态 启动中
    send_response({"type": "init_status", "message": "正在启动后台服务..."})

    # 1. 解析参数
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=str, help="Path to OCR model")
    args, _ = parser.parse_known_args()

    # 修复：如果未提供 --model-dir，则使用默认路径 (防止 NoneType 错误)
    if args.model_dir:
        models_root = os.path.dirname(args.model_dir)
    else:
        # 默认情况下，假设 models 在当前目录或上级目录
        # 在打包环境中，通常是 resources/models
        if getattr(sys, "frozen", False):
            # 如果是打包环境，默认 models 路径可能在 exe 同级目录
            models_root = os.path.join(os.path.dirname(sys.executable), "models")
        else:
            models_root = os.path.join(os.getcwd(), "models")

    translation_root = os.path.join(models_root, "translation")

    if not os.path.exists(translation_root):
        os.makedirs(translation_root, exist_ok=True)

    # [CRITICAL] Initialize Translator (Sakura/llama_cpp) FIRST
    # This is to ensure the C++ backend initializes before Torch pollutes the process space.
    send_response({"type": "init_status", "message": "正在预加载翻译引擎组件..."})
    translator = None
    try:
        log_message(f"Init Translator (Sakura) root: {translation_root}")
        # 强制指定使用 sakura
        # 仅实例化对象，不进行任何底层 C++ 初始化
        # 真正的初始化 (load_model) 会在 check_model_exists() 返回 True 后，
        # 在 translate 命令中按需触发。
        translator = get_translator_engine("sakura", translation_root)

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

        # 确保传入有效的 OCR 模型路径
        if args.model_dir:
            ocr_model_path = args.model_dir
        else:
            ocr_model_path = os.path.join(models_root, "ocr")

        ocr_engine = OCREngine(model_dir=ocr_model_path)
    except Exception as e:
        log_message(f"[ERROR] OCR Init Failed: {e}")
        send_response(
            {
                "type": "init_error",
                "message": f"OCR 模型加载失败: {str(e)}",
                "detail": "请检查网络连接，或尝试手动下载模型。",
            }
        )
        sys.exit(1)

    # 初始化分词器
    send_response({"type": "init_status", "message": "正在加载日语分词组件..."})
    from modules.tokenizer import JapaneseTokenizer

    tokenizer = JapaneseTokenizer()

    # [MODIFIED] Translator is already instantiated above for pre-loading.
    # We just need to ensure it's assigned to the variable we use later.
    if translator is None:
        translator = get_translator_engine("sakura", translation_root)

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
                # 尝试直接解析（兼容旧模式，虽然现在应该都是 Base64）
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
                    tokens = tokenizer.tokenize(text)
                    send_response({"id": req_id, "success": True, "tokens": tokens})
                except Exception as e:
                    log_message(f"Tokenize Error: {e}")
                    send_response({"id": req_id, "success": False, "error": str(e)})

            # --- Translate ---
            elif command == "translate":
                try:
                    text = request.get("text", "")
                    log_message(
                        f"[DEBUG] Processing translate request for: {repr(text)[:50]}..."
                    )

                    # 1. 检查是否已加载
                    if not translator.is_ready:
                        log_message(
                            "[DEBUG] Translator not ready. Checking model existence..."
                        )
                        # 2. 检查物理文件是否存在
                        if translator.check_model_exists():
                            # 存在则加载
                            log_message(
                                "[DEBUG] Model exists. Initializing translator..."
                            )
                            translator.initialize()
                        else:
                            log_message("[ERROR] Model not found.")
                            raise Exception("MODEL_NOT_FOUND")

                    # 3. 执行翻译
                    log_message("[DEBUG] Executing translator.translate()...")
                    result = translator.translate(text)
                    log_message(f"[DEBUG] Translation result: {repr(result)[:50]}...")
                    send_response(
                        {"id": req_id, "success": True, "translation": result}
                    )

                except Exception as e:
                    # 捕获错误 (包括上面的 MODEL_NOT_FOUND)
                    log_message(f"[ERROR] Translation Error: {e}")
                    import traceback

                    log_message(f"[ERROR] Traceback: {traceback.format_exc()}")
                    send_response({"id": req_id, "success": False, "error": str(e)})

            # --- Model Management (New) ---

            # 1. 检查模型状态
            elif command == "check_model":
                exists = translator.check_model_exists()
                send_response({"id": req_id, "success": True, "exists": exists})

            # 2. 下载模型
            elif command == "download_model":
                try:
                    translator.download_model()
                    # 下载完顺便初始化一下，确保可用
                    translator.initialize()
                    send_response({"id": req_id, "success": True})
                except Exception as e:
                    send_response({"id": req_id, "success": False, "error": str(e)})

            # 3. 删除模型
            elif command == "delete_model":
                success = translator.delete_model()
                send_response({"id": req_id, "success": success})

            # 4. 提取封面 (New)
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
                sys.exit(0)

        except json.JSONDecodeError:
            log_message("Received invalid JSON")
        except Exception as e:
            log_message(f"Critical Loop Error: {e}")


if __name__ == "__main__":
    main()

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
