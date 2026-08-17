# services/modules/handlers_detection.py
# 文字检测模块 handler 模块状态查询/安装/删除 与 核心的区域检测
from .utils import send_response


def handle_check_detection_module(session, request):
    return {
        "success": True,
        **session.detection_manager.get_status(verify_integrity=True),
    }


def handle_download_detection_module(session, request):
    def report_detection_progress(progress):
        # 进度事件不带 req_id 与最终响应分开推送 前端按 type 监听
        send_response(
            {"type": "detection_module_download_progress", **progress}
        )

    session.detection_registry.unload()
    status = session.detection_manager.install(
        report_detection_progress,
        request.get("download_source", "mirror"),
    )
    try:
        session.detection_registry.load()
    except Exception:
        # 安装后加载失败 回滚 删除刚装的模块 再把错误抛给 dispatch
        session.detection_registry.unload()
        session.detection_manager.delete()
        raise
    return {"success": True, **status}


def handle_delete_detection_module(session, request):
    session.detection_registry.unload()
    session.detection_manager.delete()
    return {"success": True}


def handle_detect_text_regions(session, request):
    regions = session.detection_registry.detect_base64(
        request.get("image", "")
    )
    return {"success": True, "regions": regions}
