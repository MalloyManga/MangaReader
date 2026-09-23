# services/modules/handlers_misc.py
# 词典生命周期 与系统级命令 handler
import sys


def handle_check_dictionary(session, request):
    exists = session.dictionary_manager.check_exists()
    return {"success": True, "exists": exists}


def handle_download_dictionary(session, request):
    try:
        session.dictionary_manager.download()
        # 不在此处构造分词器 词典可以先于 sudachipy 插件下载 交给 tokenize 按需重建
        session.tokenizer = None
        return {"success": True}
    except Exception:
        # 下载失败时清掉分词器 引用 下次 tokenize 会重建
        session.tokenizer = None
        raise


def handle_delete_dictionary(session, request):
    session.tokenizer = None
    success = session.dictionary_manager.delete()
    return {"success": success}


def handle_check_tokenization_runtime(session, request):
    return {
        "success": True,
        **session.tokenization_manager.get_status(verify_integrity=False),
    }


def handle_download_tokenization_runtime(session, request):
    try:
        session.tokenization_manager.install(
            download_source=session.download_source
        )
    finally:
        # 插件换版本后旧的 tokenizer 引用不能再复用
        session.tokenizer = None
    return {"success": True, **session.tokenization_manager.get_status()}


def handle_delete_tokenization_runtime(session, request):
    session.tokenizer = None
    success = session.tokenization_manager.uninstall()
    return {"success": success}


def handle_ping(session, request):
    return {"success": True, "message": "pong"}


def handle_exit(session, request):
    session.detection_registry.unload()
    sys.exit(0)
