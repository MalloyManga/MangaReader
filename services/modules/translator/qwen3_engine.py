import os
import shutil
import threading
import urllib.parse
import urllib.request

from .base import BaseTranslator
from ..utils import log_message, send_response

try:
    from llama_cpp import Llama
except ImportError:
    Llama = None


class Qwen3GgufEngine(BaseTranslator):
    def __init__(self, model_root_dir):
        path = os.path.join(model_root_dir, "qwen3-4b-instruct-2507-q4-k-m")
        super().__init__(path)

        self.repo_id = "bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF"
        self.filename = "Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
        self.expected_size = 2497280736
        self.model_file_path = os.path.join(self.model_dir, self.filename)
        self.download_bases = [
            "https://hf-mirror.com",
            "https://huggingface.co",
        ]

        self.llm = None
        self.lock = threading.Lock()

    def unload(self):
        if self.llm:
            try:
                del self.llm
            except Exception:
                pass
        self.llm = None
        self.is_ready = False

    def check_model_exists(self):
        if not os.path.exists(self.model_file_path):
            return False
        file_size = os.path.getsize(self.model_file_path)
        if file_size < self.expected_size:
            log_message(
                f"[INFO] Qwen3 model incomplete: {file_size}/{self.expected_size} bytes"
            )
            return False
        return True

    def delete_model(self):
        self.unload()
        if os.path.exists(self.model_dir):
            shutil.rmtree(self.model_dir)
            return True
        return False

    def download_model(self, progress_callback=None):
        log_message("[INFO] Downloading Qwen3-4B-Instruct-2507 Q4_K_M GGUF...")
        log_message(f"   Repo: {self.repo_id}")
        os.makedirs(self.model_dir, exist_ok=True)

        if self.check_model_exists():
            send_response(
                {
                    "type": "download_progress",
                    "percent": 100,
                    "filename": "qwen3-4b-instruct-2507-q4-k-m",
                }
            )
            return True

        for base_url in self.download_bases:
            for attempt in range(1, 4):
                try:
                    self._download_file(base_url)
                    if not self.check_model_exists():
                        raise Exception("MODEL_INSTALL_FAILED")
                    send_response(
                        {
                            "type": "download_progress",
                            "percent": 100,
                            "filename": "qwen3-4b-instruct-2507-q4-k-m",
                        }
                    )
                    log_message("[INFO] Qwen3 GGUF download complete.")
                    return True
                except Exception as exc:
                    log_message(
                        f"[WARN] Qwen3 file download failed from {base_url} "
                        f"(attempt {attempt}/3): {exc}"
                    )

        raise Exception("MODEL_DOWNLOAD_FAILED: qwen3-4b-instruct-2507-q4-k-m")

    def _download_file(self, base_url):
        quoted_repo = "/".join(urllib.parse.quote(part) for part in self.repo_id.split("/"))
        quoted_filename = urllib.parse.quote(self.filename)
        url = f"{base_url}/{quoted_repo}/resolve/main/{quoted_filename}"
        tmp_path = self.model_file_path + ".tmp"
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "MangaReader/1.3 Qwen3ModelDownloader",
                "Connection": "close",
            },
        )
        downloaded = 0
        last_percent_step = -1

        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                with open(tmp_path, "wb") as output:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        output.write(chunk)
                        downloaded += len(chunk)

                        percent = round(downloaded / self.expected_size * 100, 1)
                        step = int(percent * 2)
                        if step > last_percent_step:
                            last_percent_step = step
                            send_response(
                                {
                                    "type": "download_progress",
                                    "percent": min(percent, 99.0),
                                    "filename": self.filename,
                                }
                            )
        except Exception:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise

        if downloaded < self.expected_size:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise Exception(f"incomplete download: {downloaded}/{self.expected_size} bytes")

        os.replace(tmp_path, self.model_file_path)

    def initialize(self):
        if Llama is None:
            log_message("[ERROR] Error: llama-cpp-python not installed.")
            self.is_ready = False
            return

        if not self.check_model_exists():
            log_message(f"[WARN] Initialize failed. Model not found at: {self.model_file_path}")
            self.is_ready = False
            return

        try:
            log_message(f"[INFO] Loading Qwen3 GGUF (CPU Mode) from: {self.model_file_path}")
            self.llm = Llama(
                model_path=self.model_file_path,
                n_ctx=2048,
                n_threads=4,
                verbose=True,
                n_gpu_layers=0,
            )
            self.is_ready = True
            log_message("[INFO] Qwen3 GGUF Engine loaded.")
        except Exception as e:
            import traceback

            tb = traceback.format_exc()
            log_message(f"[ERROR] Failed to load Qwen3 GGUF: {e}\nTraceback: {tb}")
            self.is_ready = False
            raise e

    def translate(self, text):
        if not self.is_ready or not self.llm:
            raise Exception("Qwen3 GGUF engine not ready")

        with self.lock:
            system_prompt = (
                "你是一个专业的日译中翻译模型。请将用户提供的日文漫画文本翻译为自然、简洁的简体中文。"
                "只输出译文，不要解释，不要添加原文中没有的信息。"
            )
            prompt = (
                f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
                f"<|im_start|>user\n{text}<|im_end|>\n"
                f"<|im_start|>assistant\n"
            )

            output = self.llm(
                prompt,
                max_tokens=512,
                stop=["<|im_end|>", "\n\n"],
                echo=False,
                temperature=0.1,
                top_p=0.9,
                frequency_penalty=0.2,
                presence_penalty=0.1,
            )

            try:
                translation = output["choices"][0]["text"].strip()
                if "<|im_end|>" in translation:
                    translation = translation.split("<|im_end|>", 1)[0].strip()
                return translation
            except Exception as e:
                log_message(f"Qwen3 output error: {e}")
                return text
