# services/modules/translator/qwen3_engine.py
import os
import shutil
import subprocess
import sys
import threading
import urllib.parse
import urllib.request

from .base import BaseTranslator
from .llama_gguf import LlamaCppRuntime, get_llama_class
from ..utils import log_message, send_response


class Qwen3GgufEngine(BaseTranslator):
    def __init__(self, model_root_dir):
        path = os.path.join(model_root_dir, "qwen3-4b-instruct-2507-q4-k-m")
        super().__init__(path)

        self.repo_id = "bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF"
        self.filename = "Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
        self.expected_size = 2497280736
        self.model_file_path = os.path.join(self.model_dir, self.filename)
        self.runtime = LlamaCppRuntime(
            self.model_dir,
            progress_filename="qwen3-runtime",
            model_id="qwen3-4b-instruct-2507-q4-k-m",
            log_prefix="Qwen3",
        )
        self.download_bases = [
            "https://hf-mirror.com",
            "https://huggingface.co",
        ]

        self.llm = None
        self.use_external_runtime = False
        self.lock = threading.Lock()

    def unload(self):
        if self.llm:
            try:
                del self.llm
            except Exception:
                pass
        self.llm = None
        self.use_external_runtime = False
        self.is_ready = False

    def check_model_exists(self):
        if not os.path.exists(self.model_file_path):
            log_message(f"[INFO] Qwen3 model missing: {self.model_file_path}")
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
                    "model_id": "qwen3-4b-instruct-2507-q4-k-m",
                }
            )
            return True

        for base_url in self.download_bases:
            for attempt in range(1, 6):
                try:
                    self._download_file(base_url)
                    if not self.check_model_exists():
                        raise Exception("MODEL_INSTALL_FAILED")
                    send_response(
                        {
                            "type": "download_progress",
                            "percent": 100,
                            "filename": "qwen3-4b-instruct-2507-q4-k-m",
                            "model_id": "qwen3-4b-instruct-2507-q4-k-m",
                        }
                    )
                    log_message("[INFO] Qwen3 GGUF download complete.")
                    return True
                except Exception as exc:
                    log_message(
                        f"[WARN] Qwen3 file download failed from {base_url} "
                        f"(attempt {attempt}/5): {exc}"
                    )

        raise Exception("MODEL_DOWNLOAD_FAILED: qwen3-4b-instruct-2507-q4-k-m")

    def _download_file(self, base_url):
        quoted_repo = "/".join(urllib.parse.quote(part) for part in self.repo_id.split("/"))
        quoted_filename = urllib.parse.quote(self.filename)
        url = f"{base_url}/{quoted_repo}/resolve/main/{quoted_filename}"
        tmp_path = self.model_file_path + ".tmp"
        resume_from = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
        if resume_from >= self.expected_size:
            os.replace(tmp_path, self.model_file_path)
            return

        headers = {
            "User-Agent": "MangaReader/1.4 Qwen3ModelDownloader",
            "Connection": "close",
        }
        if resume_from > 0:
            headers["Range"] = f"bytes={resume_from}-"
        request = urllib.request.Request(
            url,
            headers=headers,
        )
        last_percent_step = -1

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

                    percent = round(downloaded / self.expected_size * 100, 1)
                    step = int(percent * 2)
                    if step > last_percent_step:
                        last_percent_step = step
                        send_response(
                            {
                                "type": "download_progress",
                                "percent": min(percent, 99.0),
                                "filename": self.filename,
                                "model_id": "qwen3-4b-instruct-2507-q4-k-m",
                            }
                        )

        downloaded = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
        if downloaded < self.expected_size:
            raise Exception(f"incomplete download: {downloaded}/{self.expected_size} bytes")

        os.replace(tmp_path, self.model_file_path)

    def initialize(self):
        if self.runtime.needs_external():
            if not self.check_model_exists():
                log_message(f"[WARN] Initialize failed. Model not found at: {self.model_file_path}")
                self.is_ready = False
                return
            self.runtime.ensure()
            self.use_external_runtime = True
            self.is_ready = True
            log_message("[INFO] Qwen3 GGUF Engine ready via external llama.cpp runtime.")
            return

        llama_class = get_llama_class()
        if llama_class is None and not self.runtime.needs_external():
            log_message("[ERROR] Error: llama-cpp-python not installed.")
            self.is_ready = False
            return

        if not self.check_model_exists():
            log_message(f"[WARN] Initialize failed. Model not found at: {self.model_file_path}")
            self.is_ready = False
            return

        if llama_class is not None:
            try:
                log_message(f"[INFO] Loading Qwen3 GGUF (CPU Mode) from: {self.model_file_path}")
                self.llm = llama_class(
                    model_path=self.model_file_path,
                    n_ctx=2048,
                    n_threads=4,
                    verbose=False,
                    n_gpu_layers=0,
                )
                self.use_external_runtime = False
                self.is_ready = True
                log_message("[INFO] Qwen3 GGUF Engine loaded.")
                return
            except Exception as e:
                import traceback

                tb = traceback.format_exc()
                log_message(f"[ERROR] Failed to load Qwen3 GGUF via llama-cpp-python: {e}\nTraceback: {tb}")
                self.llm = None
                self.is_ready = False
                if not self.runtime.needs_external():
                    raise e

    def translate(self, text):
        if not self.is_ready:
            raise Exception("Qwen3 GGUF engine not ready")

        with self.lock:
            prompt = self._build_chat_prompt(text)

            if self.use_external_runtime:
                return self.runtime.translate_with_cli(
                    prompt,
                    self.model_file_path,
                    context_window=2048,
                    error_prefix="QWEN_TRANSLATION",
                )

            output = self.llm(
                prompt,
                max_tokens=512,
                stop=["<|im_end|>"],
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

    def _build_chat_prompt(self, text):
        system_prompt = (
            "You are a professional Japanese-to-Simplified-Chinese manga translator. "
            "Translate the user's Japanese manga text into natural, concise Simplified Chinese. "
            "Output only the translation. Do not explain or add information."
        )
        return (
            f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
            f"<|im_start|>user\n{text}<|im_end|>\n"
            f"<|im_start|>assistant\n"
        )
