import os
import shutil
import threading
import urllib.parse
import urllib.request

from .base import BaseTranslator
from ..utils import log_message, send_response


class OpusMtJaZhEngine(BaseTranslator):
    def __init__(self, model_root_dir):
        path = os.path.join(model_root_dir, "opus-mt-ja-zh")
        super().__init__(path)

        self.repo_id = "shun89/opus-mt-ja-zh"
        self.download_bases = [
            "https://hf-mirror.com",
            "https://huggingface.co",
        ]
        self.required_files = {
            "config.json": 1640,
            "generation_config.json": 258,
            "pytorch_model.bin": 310022978,
            "source.spm": 1309375,
            "special_tokens_map.json": 72,
            "target.spm": 1309375,
            "tokenizer_config.json": 42,
            "vocab.json": 1803912,
        }
        self.integrity_files = [
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
        for filename in self.integrity_files:
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

        total_bytes = sum(self.required_files.values())
        downloaded_bytes = 0
        last_percent_step = -1

        for filename, expected_size in self.required_files.items():
            target_path = os.path.join(self.model_dir, filename)
            if os.path.exists(target_path) and os.path.getsize(target_path) >= expected_size:
                downloaded_bytes += expected_size
                continue

            file_downloaded = False
            for base_url in self.download_bases:
                for attempt in range(1, 6):
                    try:
                        downloaded = self._download_file(
                            base_url,
                            filename,
                            target_path,
                            expected_size,
                            downloaded_bytes,
                            total_bytes,
                            last_percent_step,
                        )
                        downloaded_bytes += downloaded
                        last_percent_step = int(downloaded_bytes / total_bytes * 200)
                        file_downloaded = True
                        break
                    except Exception as exc:
                        log_message(
                            f"[WARN] OPUS file download failed from {base_url} "
                            f"(attempt {attempt}/5): {exc}"
                        )
                if file_downloaded:
                    break

            if not file_downloaded:
                raise Exception(f"MODEL_DOWNLOAD_FAILED: {filename}")

        if not self.check_model_exists():
            raise Exception("MODEL_INSTALL_FAILED")

        send_response(
            {
                "type": "download_progress",
                "percent": 100,
                "filename": "opus-mt-ja-zh",
                "model_id": "opus-mt-ja-zh",
            }
        )
        log_message("[INFO] OPUS-MT ja-zh download complete.")
        return True

    def _download_file(
        self,
        base_url,
        filename,
        target_path,
        expected_size,
        previous_bytes,
        total_bytes,
        last_percent_step,
    ):
        quoted_repo = "/".join(urllib.parse.quote(part) for part in self.repo_id.split("/"))
        quoted_filename = urllib.parse.quote(filename)
        url = f"{base_url}/{quoted_repo}/resolve/main/{quoted_filename}"
        tmp_path = target_path + ".tmp"
        resume_from = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
        if resume_from >= expected_size:
            os.replace(tmp_path, target_path)
            return expected_size

        headers = {
            "User-Agent": "MangaReader/1.4 OPUSModelDownloader",
            "Connection": "close",
        }
        if resume_from > 0:
            headers["Range"] = f"bytes={resume_from}-"
        request = urllib.request.Request(
            url,
            headers=headers,
        )

        with urllib.request.urlopen(request, timeout=120) as response:
            status = getattr(response, "status", None)
            if resume_from > 0 and status != 206:
                resume_from = 0
                mode = "wb"
            else:
                mode = "ab" if resume_from > 0 else "wb"

            downloaded = resume_from
            with open(tmp_path, mode) as output:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)

                    percent = round((previous_bytes + downloaded) / total_bytes * 100, 1)
                    step = int(percent * 2)
                    if step > last_percent_step:
                        last_percent_step = step
                        send_response(
                            {
                                "type": "download_progress",
                                "percent": min(percent, 99.0),
                                "filename": filename,
                                "model_id": "opus-mt-ja-zh",
                            }
                        )

        downloaded = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0

        if downloaded < expected_size:
            raise Exception(f"incomplete download: {downloaded}/{expected_size} bytes")

        os.replace(tmp_path, target_path)
        return expected_size

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
