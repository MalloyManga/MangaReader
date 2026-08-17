# services/modules/openmp.py
# OpenMP 动态库预加载 仅打包环境生效
# torch 的 c10.dll 依赖 libiomp5md.dll 在部分加载顺序下会找不到
# 这里在 OCR 引擎与 opus 翻译引擎初始化之前手动加载它
import ctypes
import os
import sys

from .utils import log_message


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
