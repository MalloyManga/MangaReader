# services/modules/dispatch.py
# 路由分发 对应 electron 侧 ipc/register.cjs 的 registerAll
# 用 match/case 取代原来的 if/elif 链 每个 case 指向一个 handler
# handler 统一签名 handle_xxx(session, request) -> dict
# handler 只返回结果 dict 不含 id 由这里统一补 req_id 并处理异常
# 这样一条坏请求只会得到 success False 的响应 不会杀死消息循环
from . import handlers_book
from . import handlers_detection
from . import handlers_misc
from . import handlers_ocr
from . import handlers_translate
from .utils import log_message


def dispatch(session, request):
    req_id = request.get("id")
    command = request.get("command")

    match command:
        # 阅读主链路
        case "recognize":
            handler = handlers_ocr.handle_recognize
        case "tokenize":
            handler = handlers_ocr.handle_tokenize
        case "extract_cover":
            handler = handlers_book.handle_extract_cover

        # 翻译与模型生命周期
        case "translate":
            handler = handlers_translate.handle_translate
        case "list_translation_models":
            handler = handlers_translate.handle_list_translation_models
        case "check_model":
            handler = handlers_translate.handle_check_model
        case "download_model":
            handler = handlers_translate.handle_download_model
        case "delete_model":
            handler = handlers_translate.handle_delete_model

        # 文字检测
        case "check_detection_module":
            handler = handlers_detection.handle_check_detection_module
        case "download_detection_module":
            handler = handlers_detection.handle_download_detection_module
        case "delete_detection_module":
            handler = handlers_detection.handle_delete_detection_module
        case "detect_text_regions":
            handler = handlers_detection.handle_detect_text_regions

        # 词典
        case "check_dictionary":
            handler = handlers_misc.handle_check_dictionary
        case "download_dictionary":
            handler = handlers_misc.handle_download_dictionary
        case "delete_dictionary":
            handler = handlers_misc.handle_delete_dictionary

        # 系统级
        case "ping":
            handler = handlers_misc.handle_ping
        case "exit":
            handler = handlers_misc.handle_exit

        # never 位 对应 TS switch 里的 default 兜底
        # 原 if/elif 链没有 else 未知命令会被静默丢弃 前端的请求永远等不到应答
        # 这里必须回一个错误响应 让前端能收到失败而不是挂死
        case _:
            log_message(f"[WARN] Unknown command: {command}")
            return {
                "id": req_id,
                "success": False,
                "error": f"unknown command: {command}",
            }

    try:
        response = handler(session, request)
    except Exception as e:
        log_message(f"[ERROR] Handler '{command}' failed: {e}")
        response = {"success": False, "error": str(e)}

    return {"id": req_id, **response}
