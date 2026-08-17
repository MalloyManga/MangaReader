# services/modules/workers.py
# 子进程 worker 两件套
# 1. translate worker 打包环境下 sakura/qwen3 在独立进程里翻译 隔离 llama.cpp 的加载与崩溃风险
# 2. detection worker 文字检测跑在独立进程 按需加载/卸载 避免检测模型常驻内存
import base64
import json
import os
import subprocess
import sys

from .openmp import preload_openmp_for_ocr
from .text_detection import DetectionModuleManager, TextDetectorRegistry
from .translator import (
    get_translator_engine,
    normalize_translator_id,
    requires_translate_worker,
)
from .utils import log_message, send_response

# worker 子进程必须从入口脚本 backend_service.py 启动
# 入口脚本负责 --translate-worker / --detection-worker 参数分发与环境修复(env 编码 等)
# workers.py 自身不是可执行入口 不能用 __file__ 直接启动
_ENTRY_SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend_service.py"
)


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
    """自动检测的 worker 进程类"""
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
            command.append(_ENTRY_SCRIPT)
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
    # 命令里没有脚本路径是刻意的 本函数只在打包环境被调用(见 should_translate_in_worker)
    # 此时 sys.executable 就是 backend.exe 自身 参数直接交给入口分发
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
