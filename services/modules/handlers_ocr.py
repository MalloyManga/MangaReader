# services/modules/handlers_ocr.py
# 阅读主链路 handler 识别与分词
# handler 约定 统一签名 handle_xxx(session, request) -> dict
# 返回的 dict 不含 id 由 dispatch 统一补上 req_id 并发送
# handler 抛异常时 dispatch 统一转成 success False 的响应 前端不会挂死
from .tokenizer import JapaneseTokenizer
from .utils import log_message


def handle_recognize(session, request):
    text = session.ocr.recognize(request.get("image", ""))
    return {"success": True, "text": text}


def handle_tokenize(session, request):
    text = request.get("text", "")
    log_message(f"Processing tokenize request for: {repr(text)}")
    if not session.dictionary_manager.check_exists():
        raise Exception("DICTIONARY_NOT_FOUND")
    if session.tokenizer is None:
        session.tokenizer = JapaneseTokenizer(session.dictionary_manager.dictionary_path)
    tokens = session.tokenizer.tokenize(text)
    return {"success": True, "tokens": tokens}
