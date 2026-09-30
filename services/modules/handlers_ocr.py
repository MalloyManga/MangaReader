# services/modules/handlers_ocr.py
# 阅读主链路 handler 识别与分词
# handler 约定 统一签名 handle_xxx(session, request) -> dict
# 返回的 dict 不含 id 由 dispatch 统一补上 req_id 并发送
# handler 抛异常时 dispatch 统一转成 success False 的响应 前端不会挂死
from typing import Any

from .session import Session
from .tokenizer import JapaneseTokenizer
from .utils import log_message


def handle_recognize(session: Session, request: dict[str, Any]) -> dict[str, Any]:
    assert session.ocr is not None  # init_session 主路径保证 ocr 引擎已加载
    text = session.ocr.recognize(request.get("image", ""))
    return {"success": True, "text": text}


def handle_tokenize(session: Session, request: dict[str, Any]) -> dict[str, Any]:
    text = request.get("text", "")
    log_message(f"Processing tokenize request for: {repr(text)}")
    assert session.tokenization_manager is not None
    assert session.dictionary_manager is not None
    if not session.tokenization_manager.is_installed():
        raise Exception("TOKENIZER_RUNTIME_NOT_INSTALLED")
    if not session.dictionary_manager.check_exists():
        raise Exception("DICTIONARY_NOT_FOUND")
    if session.tokenizer is None:
        session.tokenizer = JapaneseTokenizer(
            session.dictionary_manager.dictionary_path,
            session.tokenization_manager.sys_path_entry,
        )
    if session.tokenizer.tokenizer is None:
        raise Exception(f"TOKENIZER_INIT_FAILED: {getattr(session.tokenizer, 'init_error', '')}")
    tokens = session.tokenizer.tokenize(text)
    return {"success": True, "tokens": tokens}
