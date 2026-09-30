from abc import ABC, abstractmethod
from collections.abc import Callable
from typing import Any

MIRROR_BASE = "https://hf-mirror.com"
OFFICIAL_BASE = "https://huggingface.co"


def ordered_download_bases(download_source: str) -> list[str]:
    """用户选的源排第一 另一源仅作 fallback (与 OCR 的源顺序约定一致) """
    if download_source == "official":
        return [OFFICIAL_BASE, MIRROR_BASE]
    return [MIRROR_BASE, OFFICIAL_BASE]


class BaseTranslator(ABC):
    def __init__(self, model_dir: str) -> None:
        self.model_dir = model_dir
        self.is_ready = False

    def unload(self) -> None:
        self.is_ready = False

    @abstractmethod
    def initialize(self) -> None:
        pass

    @abstractmethod
    def translate(self, text: str) -> str:
        pass

    @abstractmethod
    def download_model(
        self, progress_callback: Callable[[dict[str, Any]], None] | None = None
    ) -> bool:
        pass

    @abstractmethod
    def check_model_exists(self) -> bool:
        pass

    @abstractmethod
    def delete_model(self) -> bool:
        pass
