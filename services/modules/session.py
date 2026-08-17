# services/modules/session.py
# 会话上下文 ctx
# main() 启动时构造一次 之后所有 handler 通过它访问长期存活的实例
# handler 不直接持有全局状态 状态全部挂在这里 便于之后写 pytest 时造假会话
import atexit
import os
import sys

from .text_detection import DetectionModuleManager
from .translator import (
    DEFAULT_TRANSLATOR_ID,
    get_translator_engine,
    normalize_translator_id,
)
from .utils import log_message, send_response


class Session:
    def __init__(self, models_root, modules_root, download_source):
        self.models_root = models_root
        self.modules_root = modules_root
        self.download_source = download_source
        self.translation_root = os.path.join(models_root, "translation")
        self.dictionary_root = os.path.join(models_root, "dictionary", "sudachi")

        # 翻译引擎池 按模型 id 懒加载 当前激活的引擎记录在 translator
        self.translators = {}
        self.current_translator_id = DEFAULT_TRANSLATOR_ID
        self.translator = None

        self.ocr = None # ocr 模型引擎
        self.dictionary_manager = None
        self.tokenizer = None
        self.detection_manager = None
        self.detection_registry = None

    def get_or_create_translator(self, model_id=None):
        # 只取引擎实例 不切换激活状态 不触发卸载 供 check/download/delete 使用
        normalized_id = normalize_translator_id(model_id)
        if normalized_id not in self.translators:
            self.translators[normalized_id] = get_translator_engine(
                normalized_id, self.translation_root
            )
        return normalized_id, self.translators[normalized_id]

    def select_translator(self, model_id=None):
        # 切换激活引擎 切换时卸载上一个已加载的引擎 供 translate 使用
        normalized_id, engine = self.get_or_create_translator(model_id)
        if self.translator is not None and self.translator is not engine and self.translator.is_ready:
            self.translator.unload()
        self.current_translator_id = normalized_id
        self.translator = engine
        return normalized_id, engine


def init_session(args, models_root, modules_root):
    # 启动序列 与重构前 main() 中的初始化顺序完全一致
    session = Session(models_root, modules_root, args.download_source)

    if not os.path.exists(session.translation_root):
        os.makedirs(session.translation_root, exist_ok=True)

    # [CRITICAL] Instantiate the default translator first. For llama.cpp engines this keeps
    # the old load order without initializing model weights at startup.
    send_response({"type": "init_status", "message": "正在预加载翻译引擎组件..."})
    try:
        log_message(f"Init Translator ({DEFAULT_TRANSLATOR_ID}) root: {session.translation_root}")
        session.select_translator(DEFAULT_TRANSLATOR_ID)
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
        # OCR 引擎延迟导入 worker 模式与封面提取等路径不需要它
        from .ocr_engine import OCREngine

        # Ensure the OCR model path is valid.
        if args.model_dir:
            ocr_model_path = args.model_dir
        else:
            ocr_model_path = os.path.join(models_root, "ocr")

        session.ocr = OCREngine(
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

    from .sudachi_dictionary import SudachiDictionaryManager
    from .workers import DetectionWorkerClient

    session.dictionary_manager = SudachiDictionaryManager(session.dictionary_root)
    session.detection_manager = DetectionModuleManager(modules_root)
    session.detection_registry = DetectionWorkerClient(modules_root)
    atexit.register(session.detection_registry.unload)

    # [MODIFIED] Translator is already instantiated above for pre-loading.
    # We just need to ensure it's assigned to the variable we use later.
    if session.translator is None:
        session.select_translator(DEFAULT_TRANSLATOR_ID)

    # 准备就绪
    send_response({"type": "init_status", "message": "资源加载完毕，即将进入..."})
    send_response({"status": "ready"})
    log_message("Waiting for commands...")
    return session
