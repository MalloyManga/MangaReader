TRANSLATOR_MODELS = [
    {
        "id": "sakura-1.5b",
        "name": "Sakura-1.5B-Qwen2.5",
        "size": "1.2 GB",
        "size_bytes": 1288490189,
        "description": "轻小说/漫画向本地 GGUF 翻译模型",
        "engine": "sakura",
        "adapted_types": ["manga", "light_novel", "galgame"],
    },
    {
        "id": "qwen3-4b-instruct-2507-q4-k-m",
        "name": "Qwen3-4B-Instruct-2507 Q4_K_M",
        "size": "约 2.5 GB",
        "size_bytes": 2497280736,
        "description": "通用指令日译中 GGUF 模型，质量更高但下载和运行占用更大",
        "engine": "qwen3-gguf",
        "adapted_types": ["manga", "general", "dialogue"],
    },
    {
        "id": "opus-mt-ja-zh",
        "name": "OPUS-MT ja-zh",
        "size": "约 300 MB",
        "size_bytes": 314789923,
        "description": "小型日译中 NMT 模型，速度快、体积小",
        "engine": "opus-mt-ja-zh",
        "adapted_types": ["manga", "general"],
    },
]


def get_default_translator_id():
    return min(
        TRANSLATOR_MODELS,
        key=lambda item: item.get("size_bytes", float("inf")),
    )["id"]


DEFAULT_TRANSLATOR_ID = get_default_translator_id()

_ALIASES = {
    "sakura": "sakura-1.5b",
    "sakura-1.5b": "sakura-1.5b",
    "opus": "opus-mt-ja-zh",
    "opus-mt-ja-zh": "opus-mt-ja-zh",
    "qwen3": "qwen3-4b-instruct-2507-q4-k-m",
    "qwen3-4b": "qwen3-4b-instruct-2507-q4-k-m",
    "qwen3-4b-instruct-2507-q4-k-m": "qwen3-4b-instruct-2507-q4-k-m",
}


def normalize_translator_id(model_id):
    if not model_id:
        return DEFAULT_TRANSLATOR_ID
    normalized = _ALIASES.get(model_id)
    if not normalized:
        raise ValueError(f"Unknown translator model: {model_id}")
    return normalized


def list_translator_models():
    return sorted(
        TRANSLATOR_MODELS,
        key=lambda item: item.get("size_bytes", float("inf")),
    )


def get_translator_engine(model_id, model_root_dir):
    normalized = normalize_translator_id(model_id)
    if normalized == "sakura-1.5b":
        from .sakura_engine import SakuraEngine

        return SakuraEngine(model_root_dir)
    if normalized == "opus-mt-ja-zh":
        from .opus_engine import OpusMtJaZhEngine

        return OpusMtJaZhEngine(model_root_dir)
    if normalized == "qwen3-4b-instruct-2507-q4-k-m":
        from .qwen3_engine import Qwen3GgufEngine

        return Qwen3GgufEngine(model_root_dir)
    raise ValueError(f"Unknown translator model: {model_id}")


def requires_translate_worker(model_id):
    return normalize_translator_id(model_id) in {
        "qwen3-4b-instruct-2507-q4-k-m",
    }
