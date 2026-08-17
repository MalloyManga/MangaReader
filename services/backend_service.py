# services/backend_service.py
# 后端服务入口 薄引导层
# 职责: 环境修复(OpenMP 线程/stdin 编码) 参数解析 worker 模式分流 消息循环
# 业务逻辑全部在 modules/ 下:
# - session.py      会话上下文(ctx)与启动序列
# - dispatch.py     路由分发(match/case + never 兜底)
# - handlers_*.py   各域命令处理函数
# - workers.py      翻译/检测子进程 worker
# - cover.py        封面提取
# - openmp.py       OpenMP 动态库预加载
import argparse
import base64
import io
import json
import os
import sys

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

from modules.dispatch import dispatch
from modules.openmp import preload_openmp_for_ocr
from modules.session import init_session
from modules.utils import log_message, send_response
from modules.workers import run_detection_worker_mode, run_translate_worker_mode


def resolve_models_root(args):
    """获取模型目录"""
    # 修复 如果未提供 --model-dir 则使用默认路径 (防止 NoneType 错误)
    if args.models_root:
        return args.models_root
    if args.model_dir:
        return os.path.dirname(args.model_dir)
    # 默认情况下 假设 models 在当前目录或上级目录
    # In packaged mode models usually live under resources/models.
    if getattr(sys, "frozen", False):
        # Fallback for backends launched from a models sibling directory.
        return os.path.join(os.path.dirname(sys.executable), "models")
    return os.path.join(os.getcwd(), "models")


def parse_args():
    """使用终端来传递启动参数"""
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=str, help="Path to OCR model")
    parser.add_argument("--models-root", type=str, help="Path to models root")
    parser.add_argument(
        "--modules-root", type=str, help="Path to writable service modules"
    )
    parser.add_argument(
        "--download-source", choices=("mirror", "official"), default="mirror"
    )
    parser.add_argument("--translate-worker", action="store_true")
    parser.add_argument("--detection-worker", action="store_true")
    args, _ = parser.parse_known_args()
    return args


def decode_request(line):
    # 请求载荷格式: JSON 序列化 -> UTF-8 编码 -> Base64
    # 兼容旧调用方的裸 JSON(不经 Base64)
    try:
        json_bytes = base64.b64decode(line)
        json_str = json_bytes.decode("utf-8")
        return json.loads(json_str)
    except Exception as e:
        log_message(f"[CRITICAL] Failed to decode Base64 payload: {e}")
        # Try raw JSON for compatibility with old callers.
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            return None


def run_message_loop(session):
    for line in sys.stdin:
        try:
            line = line.strip()
            if not line:
                continue

            request = decode_request(line)
            if request is None:
                log_message("Received invalid JSON")
                continue

            send_response(dispatch(session, request))

        except json.JSONDecodeError:
            log_message("Received invalid JSON")
        except Exception as e:
            log_message(f"Critical Loop Error: {e}")


def main():
    log_message("Starting Backend Service")

    send_response({"type": "init_status", "message": "正在启动后台服务..."})

    args = parse_args()
    models_root = resolve_models_root(args)

    if args.translate_worker:
        sys.exit(run_translate_worker_mode(models_root))

    modules_root = args.modules_root or os.path.join(
        os.path.dirname(models_root), "services", "modules"
    )
    if args.detection_worker:
        sys.exit(run_detection_worker_mode(modules_root))

    preload_openmp_for_ocr()

    session = init_session(
        args, models_root, modules_root
    )  # 正式挂载 session 之后开始 msg 循环
    run_message_loop(session)


if __name__ == "__main__":
    main()
