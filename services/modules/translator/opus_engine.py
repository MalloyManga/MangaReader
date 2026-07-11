import os
import shutil
import threading

from huggingface_hub import snapshot_download

from .base import BaseTranslator
from ..utils import log_message, patch_tqdm


class OpusMtJaZhEngine(BaseTranslator):
    def __init__(self, model_root_dir):
        path = os.path.join(model_root_dir, "opus-mt-ja-zh")
        super().__init__(path)

        self.repo_id = "shun89/opus-mt-ja-zh"
        self.required_files = [
            "config.json",
            "pytorch_model.bin",
            "source.spm",
            "target.spm",
            "tokenizer_config.json",
            "vocab.json",
        ]
        self.model = None
        self.tokenizer = None
        self.lock = threading.Lock()

    def unload(self):
        self.model = None
        self.tokenizer = None
        self.is_ready = False

    def check_model_exists(self):
        if not os.path.isdir(self.model_dir):
            return False
        for filename in self.required_files:
            path = os.path.join(self.model_dir, filename)
            if not os.path.exists(path) or os.path.getsize(path) == 0:
                log_message(f"[INFO] OPUS model missing file: {filename}")
                return False
        return True

    def delete_model(self):
        self.unload()
        if os.path.exists(self.model_dir):
            shutil.rmtree(self.model_dir)
            return True
        return False

    def download_model(self, progress_callback=None):
        log_message("[INFO] Downloading OPUS-MT ja-zh via HuggingFace Hub...")
        log_message(f"   Repo: {self.repo_id}")
        os.makedirs(self.model_dir, exist_ok=True)

        with patch_tqdm(
            msg_type="download_progress", msg_key="filename", default_msg="opus-mt-ja-zh"
        ):
            snapshot_download(
                repo_id=self.repo_id,
                local_dir=self.model_dir,
                allow_patterns=self.required_files
                + ["generation_config.json", "special_tokens_map.json"],
                token=False,
            )

        if not self.check_model_exists():
            raise Exception("MODEL_INSTALL_FAILED")

        log_message("[INFO] OPUS-MT ja-zh download complete.")
        return True

    def initialize(self):
        if not self.check_model_exists():
            self.is_ready = False
            return

        try:
            from transformers import MarianMTModel, MarianTokenizer

            log_message(f"[INFO] Loading OPUS-MT ja-zh from: {self.model_dir}")
            self.tokenizer = MarianTokenizer.from_pretrained(
                self.model_dir, local_files_only=True
            )
            self.model = MarianMTModel.from_pretrained(
                self.model_dir, local_files_only=True
            )
            self.model.eval()
            self.is_ready = True
            log_message("[INFO] OPUS-MT ja-zh engine loaded.")
        except Exception as e:
            log_message(f"[ERROR] Failed to load OPUS-MT ja-zh: {e}")
            self.unload()
            raise e

    def translate(self, text):
        if not self.is_ready or not self.model or not self.tokenizer:
            raise Exception("OPUS-MT ja-zh engine not ready")

        with self.lock:
            try:
                import torch

                inputs = self.tokenizer(
                    text,
                    return_tensors="pt",
                    truncation=True,
                    max_length=512,
                )
                with torch.no_grad():
                    generated = self.model.generate(
                        **inputs,
                        max_new_tokens=256,
                        num_beams=4,
                        early_stopping=True,
                    )
                return self.tokenizer.decode(
                    generated[0],
                    skip_special_tokens=True,
                    clean_up_tokenization_spaces=True,
                ).strip()
            except Exception as e:
                log_message(f"[ERROR] OPUS-MT translation failed: {e}")
                raise e
