# services/modules/handlers_book.py
# 书架域 handler 封面提取
# handler 约定 与其他 handlers_*.py 一致 handle_xxx(session, request) -> dict
from typing import Any

from .cover import extract_cover_image
from .session import Session
from .utils import log_message


def handle_extract_cover(session: Session, request: dict[str, Any]) -> dict[str, Any]:
    path_arg = request.get("path", "")
    log_message(f"Extracting cover from: {path_arg}")
    cover_base64 = extract_cover_image(path_arg)
    if cover_base64:
        return {"success": True, "cover": cover_base64}
    return {"success": False, "error": "No image found"}
