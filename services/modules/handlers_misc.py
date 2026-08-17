# services/modules/handlers_misc.py
# 词典生命周期 与系统级命令 handler
import sys

from .tokenizer import JapaneseTokenizer


def handle_check_dictionary(session, request):
    exists = session.dictionary_manager.check_exists()
    return {"success": True, "exists": exists}


def handle_download_dictionary(session, request):
    try:
        session.dictionary_manager.download()
        session.tokenizer = JapaneseTokenizer(session.dictionary_manager.dictionary_path)
        return {"success": True}
    except Exception:
        # 下载失败时清掉分词器 引用 下次 tokenize 会重建
        session.tokenizer = None
        raise


def handle_delete_dictionary(session, request):
    session.tokenizer = None
    success = session.dictionary_manager.delete()
    return {"success": success}


def handle_ping(session, request):
    return {"success": True, "message": "pong"}


def handle_exit(session, request):
    session.detection_registry.unload()
    sys.exit(0)
