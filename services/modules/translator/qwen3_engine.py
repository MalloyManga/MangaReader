import os
import shutil
import subprocess
import sys
import threading
import urllib.parse
import urllib.request
import ctypes
import zipfile

from .base import BaseTranslator
from ..utils import log_message, send_response

Llama = None
_LLAMA_DLL_HANDLES = []


def _prepare_llama_cpp_runtime():
    if not getattr(sys, "frozen", False) or not sys.platform.startswith("win"):
        return

    candidates = [
        os.path.join(getattr(sys, "_MEIPASS", ""), "llama_cpp", "lib"),
        os.path.join(os.path.dirname(sys.executable), "_internal", "llama_cpp", "lib"),
    ]

    for lib_dir in candidates:
        if not lib_dir or not os.path.isdir(lib_dir):
            continue

        os.environ["LLAMA_CPP_LIB_PATH"] = lib_dir
        os.environ["PATH"] = lib_dir + os.pathsep + os.environ.get("PATH", "")
        try:
            os.add_dll_directory(lib_dir)
        except Exception:
            pass

        for dll_name in ("ggml-base.dll", "ggml.dll", "ggml-cpu.dll", "llama.dll"):
            dll_path = os.path.join(lib_dir, dll_name)
            if not os.path.exists(dll_path):
                continue
            try:
                _LLAMA_DLL_HANDLES.append(
                    ctypes.CDLL(dll_path, winmode=getattr(ctypes, "RTLD_GLOBAL", 0))
                )
            except Exception as exc:
                log_message(f"[WARN] Failed to pre-load {dll_name}: {exc}")
        return


def _get_llama_class():
    global Llama
    if Llama is None:
        _prepare_llama_cpp_runtime()
        try:
            from llama_cpp import Llama as LlamaClass
        except ImportError:
            return None
        Llama = LlamaClass
    return Llama


class Qwen3GgufEngine(BaseTranslator):
    def __init__(self, model_root_dir):
        path = os.path.join(model_root_dir, "qwen3-4b-instruct-2507-q4-k-m")
        super().__init__(path)

        self.repo_id = "bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF"
        self.filename = "Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
        self.expected_size = 2497280736
        self.model_file_path = os.path.join(self.model_dir, self.filename)
        self.runtime_dir = os.path.join(self.model_dir, "runtime", "llama-cpp-win-cpu-x64")
        self.runtime_zip_name = "llama-b9966-bin-win-cpu-x64.zip"
        self.runtime_expected_size = 18211851
        self.runtime_download_urls = [
            "https://gh.llkk.cc/https://github.com/ggml-org/llama.cpp/releases/download/b9966/llama-b9966-bin-win-cpu-x64.zip",
            "https://github.com/ggml-org/llama.cpp/releases/download/b9966/llama-b9966-bin-win-cpu-x64.zip",
        ]
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

    def _runtime_exe_path(self):
        return os.path.join(self.runtime_dir, "llama-cli.exe")

    def _needs_external_runtime(self):
        return getattr(sys, "frozen", False) and sys.platform.startswith("win")

    def _runtime_exists(self):
        exe_path = self._runtime_exe_path()
        if not os.path.exists(exe_path):
            return False
        required_dlls = [
            "ggml-base.dll",
            "ggml.dll",
            "llama.dll",
            "llama-common.dll",
            "llama-cli-impl.dll",
        ]
        has_required_files = all(
            os.path.exists(os.path.join(self.runtime_dir, name))
            for name in required_dlls
        )
        has_cpu_backend = any(
            name.startswith("ggml-cpu") and name.endswith(".dll")
            for name in os.listdir(self.runtime_dir)
        )
        return has_required_files and has_cpu_backend

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
            if self._needs_external_runtime():
                send_response(
                    {
                        "type": "download_progress",
                        "percent": 99.0,
                        "filename": "qwen3-runtime",
                        "model_id": "qwen3-4b-instruct-2507-q4-k-m",
                        "stage": "runtime",
                    }
                )
                self._ensure_runtime()
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
                    if self._needs_external_runtime():
                        send_response(
                            {
                                "type": "download_progress",
                                "percent": 99.0,
                                "filename": "qwen3-runtime",
                                "model_id": "qwen3-4b-instruct-2507-q4-k-m",
                                "stage": "runtime",
                            }
                        )
                        self._ensure_runtime()
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

    def _ensure_runtime(self):
        if not self._needs_external_runtime():
            return True
        if self._runtime_exists():
            return True

        os.makedirs(self.runtime_dir, exist_ok=True)
        zip_path = os.path.join(self.model_dir, self.runtime_zip_name)

        for url in self.runtime_download_urls:
            try:
                log_message(f"[INFO] Downloading llama.cpp runtime: {url}")
                self._download_runtime_zip(url, zip_path)
                self._extract_runtime_zip(zip_path)
                if not self._runtime_exists():
                    raise Exception("LLAMA_RUNTIME_INSTALL_FAILED")
                send_response(
                    {
                        "type": "download_progress",
                        "percent": 100,
                        "filename": "qwen3-runtime",
                        "model_id": "qwen3-4b-instruct-2507-q4-k-m",
                    }
                )
                try:
                    os.remove(zip_path)
                except Exception:
                    pass
                return True
            except Exception as exc:
                log_message(f"[WARN] llama.cpp runtime download failed: {exc}")

        raise Exception("LLAMA_RUNTIME_DOWNLOAD_FAILED")

    def _download_runtime_zip(self, url, zip_path):
        tmp_path = zip_path + ".tmp"
        resume_from = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
        if resume_from >= self.runtime_expected_size:
            os.replace(tmp_path, zip_path)
            return

        headers = {
            "User-Agent": "MangaReader/1.4 LlamaCppRuntimeDownloader",
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
                    chunk = response.read(1024 * 512)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    percent = round(downloaded / self.runtime_expected_size * 100, 1)
                    step = int(percent * 2)
                    if step > last_percent_step:
                        last_percent_step = step
                        send_response(
                            {
                                "type": "download_progress",
                                "percent": min(percent, 99.0),
                                "filename": "qwen3-runtime",
                                "model_id": "qwen3-4b-instruct-2507-q4-k-m",
                                "stage": "runtime",
                            }
                        )

        downloaded = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
        if downloaded < self.runtime_expected_size * 0.9:
            raise Exception(f"incomplete runtime download: {downloaded} bytes")

        os.replace(tmp_path, zip_path)

    def _extract_runtime_zip(self, zip_path):
        if os.path.exists(self.runtime_dir):
            shutil.rmtree(self.runtime_dir)
        os.makedirs(self.runtime_dir, exist_ok=True)

        with zipfile.ZipFile(zip_path, "r") as archive:
            for member in archive.infolist():
                if member.is_dir():
                    continue
                filename = os.path.basename(member.filename)
                if not filename:
                    continue
                with archive.open(member) as source, open(
                    os.path.join(self.runtime_dir, filename), "wb"
                ) as target:
                    shutil.copyfileobj(source, target)

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
        if getattr(sys, "frozen", False) and sys.platform.startswith("win"):
            if not self.check_model_exists():
                log_message(f"[WARN] Initialize failed. Model not found at: {self.model_file_path}")
                self.is_ready = False
                return
            self._ensure_runtime()
            self.is_ready = True
            log_message("[INFO] Qwen3 GGUF Engine ready via llama.cpp runtime.")
            return

        llama_class = _get_llama_class()
        if llama_class is None:
            log_message("[ERROR] Error: llama-cpp-python not installed.")
            self.is_ready = False
            return

        if not self.check_model_exists():
            log_message(f"[WARN] Initialize failed. Model not found at: {self.model_file_path}")
            self.is_ready = False
            return

        try:
            log_message(f"[INFO] Loading Qwen3 GGUF (CPU Mode) from: {self.model_file_path}")
            self.llm = llama_class(
                model_path=self.model_file_path,
                n_ctx=2048,
                n_threads=4,
                verbose=False,
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
        if not self.is_ready:
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

            if getattr(sys, "frozen", False) and sys.platform.startswith("win"):
                return self._translate_with_llama_cli(prompt)

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

    def _translate_with_llama_cli(self, prompt):
        exe_path = self._runtime_exe_path()
        if not self._runtime_exists():
            raise Exception("LLAMA_RUNTIME_NOT_FOUND")

        command = [
            exe_path,
            "-m",
            self.model_file_path,
            "-p",
            prompt,
            "-n",
            "512",
            "-c",
            "2048",
            "-t",
            "4",
            "--temp",
            "0.1",
            "--top-p",
            "0.9",
            "--no-display-prompt",
            "--simple-io",
        ]

        try:
            completed = subprocess.run(
                command,
                cwd=self.runtime_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=180,
                creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
            )
        except subprocess.TimeoutExpired:
            raise Exception("QWEN_TRANSLATION_TIMEOUT")

        if completed.returncode != 0:
            stderr_tail = "\n".join(completed.stderr.splitlines()[-10:])
            log_message(f"[ERROR] llama-cli failed: {stderr_tail}")
            raise Exception("QWEN_TRANSLATION_FAILED")

        translation = completed.stdout.strip()
        if "<|im_end|>" in translation:
            translation = translation.split("<|im_end|>", 1)[0].strip()
        if "\n\n" in translation:
            translation = translation.split("\n\n", 1)[0].strip()
        return translation
