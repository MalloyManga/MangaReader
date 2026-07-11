from .opus_engine import OpusMtJaZhEngine
from .sakura_engine import SakuraEngine


DEFAULT_TRANSLATOR_ID = "sakura-1.5b"

TRANSLATOR_MODELS = [
    {
        "id": "sakura-1.5b",
        "name": "Sakura-1.5B-Qwen2.5",
        "size": "1.2 GB",
        "description": "轻小说/漫画向本地 GGUF 翻译模型",
        "engine": "sakura",
    },
    {
        "id": "opus-mt-ja-zh",
        "name": "OPUS-MT ja-zh",
        "size": "约 300 MB",
        "description": "小型日译中 NMT 模型，速度快、体积小",
        "engine": "opus-mt-ja-zh",
    },
]

_ALIASES = {
    "sakura": "sakura-1.5b",
    "sakura-1.5b": "sakura-1.5b",
    "opus": "opus-mt-ja-zh",
    "opus-mt-ja-zh": "opus-mt-ja-zh",
}


def normalize_translator_id(model_id):
    if not model_id:
        return DEFAULT_TRANSLATOR_ID
    normalized = _ALIASES.get(model_id)
    if not normalized:
        raise ValueError(f"Unknown translator model: {model_id}")
    return normalized


def list_translator_models():
    return TRANSLATOR_MODELS


def get_translator_engine(model_id, model_root_dir):
    normalized = normalize_translator_id(model_id)
    if normalized == "sakura-1.5b":
        return SakuraEngine(model_root_dir)
    if normalized == "opus-mt-ja-zh":
        return OpusMtJaZhEngine(model_root_dir)
    raise ValueError(f"Unknown translator model: {model_id}")
