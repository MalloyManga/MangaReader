# services/modules/handlers_translate.py
# 翻译与模型生命周期 handler
import traceback

from .translator import (
    DEFAULT_TRANSLATOR_ID,
    list_translator_models,
    normalize_translator_id,
)
from .utils import log_message
from .workers import should_translate_in_worker, translate_in_worker


def handle_translate(session, request):
    text = request.get("text", "")
    model_id = request.get("model_id") or request.get("modelId")
    selected_model_id = normalize_translator_id(model_id)
    log_message(
        f"[DEBUG] Processing translate request with {selected_model_id}: {repr(text)[:50]}..."
    )

    try:
        if should_translate_in_worker(selected_model_id):
            log_message("[DEBUG] Using isolated translate worker in packaged mode...")
            session.current_translator_id = selected_model_id
            result, worker_model_id = translate_in_worker(
                session.models_root, selected_model_id, text
            )
            log_message(f"[DEBUG] Translation result: {repr(result)[:50]}...")
            return {
                "success": True,
                "translation": result,
                "model_id": worker_model_id,
            }

        selected_model_id, selected_translator = session.select_translator(
            selected_model_id
        )

        # 1. 检查是否已加载
        if not selected_translator.is_ready:
            log_message(
                "[DEBUG] Translator not ready. Checking model existence..."
            )
            # Check physical model files before lazy loading.
            if selected_translator.check_model_exists():
                # Load the model only when it is first used.
                log_message(
                    "[DEBUG] Model exists. Initializing translator..."
                )
                selected_translator.initialize()
            else:
                log_message("[ERROR] Model not found.")
                raise Exception("MODEL_NOT_FOUND")

        # 2. 执行翻译
        log_message("[DEBUG] Executing translator.translate()...")
        result = selected_translator.translate(text)
        log_message(f"[DEBUG] Translation result: {repr(result)[:50]}...")
        return {
            "success": True,
            "translation": result,
            "model_id": selected_model_id,
        }
    except Exception as e:
        # Capture errors, including MODEL_NOT_FOUND above.
        log_message(f"[ERROR] Translation Error: {e}")
        log_message(f"[ERROR] Traceback: {traceback.format_exc()}")
        raise


def handle_list_translation_models(session, request):
    return {
        "success": True,
        "models": list_translator_models(),
        "default_model_id": DEFAULT_TRANSLATOR_ID,
        "current_model_id": session.current_translator_id,
    }


def handle_check_model(session, request):
    model_id = request.get("model_id") or request.get("modelId")
    selected_model_id, selected_translator = session.get_or_create_translator(model_id)
    exists = selected_translator.check_model_exists()
    return {
        "success": True,
        "exists": exists,
        "model_id": selected_model_id,
    }


def handle_download_model(session, request):
    model_id = request.get("model_id") or request.get("modelId")
    selected_model_id, selected_translator = session.get_or_create_translator(model_id)
    selected_translator.download_model()
    # Download only verifies file integrity; translation lazy-loads weights.
    if not selected_translator.check_model_exists():
        raise Exception("MODEL_INSTALL_FAILED")
    return {
        "success": True,
        "model_id": selected_model_id,
    }


def handle_delete_model(session, request):
    model_id = request.get("model_id") or request.get("modelId")
    selected_model_id, selected_translator = session.get_or_create_translator(model_id)
    success = selected_translator.delete_model()
    return {
        "success": success,
        "model_id": selected_model_id,
    }
