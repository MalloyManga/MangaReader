# services/modules/translator/sakura_engine.py
import os
import threading
import shutil
import sys
import json
import contextlib
import ctypes
import re
import subprocess
import tempfile
import urllib.request
import zipfile
from .base import BaseTranslator
from huggingface_hub import hf_hub_download
from ..utils import log_message, patch_tqdm, send_response

Llama = None


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


class SakuraEngine(BaseTranslator):
    def __init__(self, model_root_dir):
        path = os.path.join(model_root_dir, "sakura")
        super().__init__(path)

        self.repo_id = "shing3232/Sakura-1.5B-Qwen2.5-v1.0-GGUF-IMX"
        self.filename = "sakura-1.5b-qwen2.5-v1.0-Q5KS.gguf"

        # 为了更准确的判断，我们这里还是用 .gguf 结尾的文件路径
        self.model_file_path = os.path.join(self.model_dir, self.filename)
        self.runtime_dir = os.path.join(self.model_dir, "runtime", "llama-cpp-win-cpu-x64")
        self.runtime_zip_name = "llama-b9966-bin-win-cpu-x64.zip"
        self.runtime_expected_size = 18211851
        self.runtime_download_urls = [
            "https://gh.llkk.cc/https://github.com/ggml-org/llama.cpp/releases/download/b9966/llama-b9966-bin-win-cpu-x64.zip",
            "https://github.com/ggml-org/llama.cpp/releases/download/b9966/llama-b9966-bin-win-cpu-x64.zip",
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
        # 检查物理文件是否存在
        # 注意：使用 hf_hub_download 后，实际文件可能是一个 symlink 指向 .cache
        # 但 os.path.exists 会自动追踪 symlink，所以逻辑是通用的
        path = self.model_file_path
        exists = os.path.exists(path)
        log_message(f"[INFO] [Check] Path: {path}")
        log_message(f"[INFO] [Check] Exists: {exists}")
        return exists

    def delete_model(self):
        # 1. 释放内存
        if self.llm:
            log_message("[INFO] Unloading model...")
            self.unload()

        deleted = False

        # 2. 删除主文件 (如果是 symlink 会删掉 symlink，如果是实体文件删实体)
        if os.path.exists(self.model_file_path):
            try:
                os.remove(self.model_file_path)
                log_message(f"[INFO] Deleted model link/file: {self.filename}")
                deleted = True
            except Exception as e:
                log_message(f"[ERROR] Failed to delete model file: {e}")

        # 3.  关键：清理 .cache 缓存
        # HuggingFace 的默认缓存结构通常在 models/translation/sakura/.cache
        # 我们把它整个干掉，这样才是真的“卸载”
        cache_dir = os.path.join(self.model_dir, ".cache")
        if os.path.exists(cache_dir):
            try:
                shutil.rmtree(cache_dir)
                log_message("[INFO] Cleaned up HuggingFace cache directory.")
                deleted = True
            except Exception as e:
                log_message(f"[WARN] Failed to clean cache: {e}")

        runtime_root = os.path.join(self.model_dir, "runtime")
        if os.path.exists(runtime_root):
            try:
                shutil.rmtree(runtime_root)
                log_message("[INFO] Cleaned up Sakura llama.cpp runtime.")
                deleted = True
            except Exception as e:
                log_message(f"[WARN] Failed to clean Sakura runtime: {e}")

        return deleted

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

    def _ensure_runtime(self):
        if not self._needs_external_runtime():
            return True
        if self._runtime_exists():
            return True

        os.makedirs(self.runtime_dir, exist_ok=True)
        zip_path = os.path.join(self.model_dir, self.runtime_zip_name)

        for url in self.runtime_download_urls:
            try:
                log_message(f"[INFO] Downloading llama.cpp runtime for Sakura: {url}")
                self._download_runtime_zip(url, zip_path)
                self._extract_runtime_zip(zip_path)
                if not self._runtime_exists():
                    raise Exception("LLAMA_RUNTIME_INSTALL_FAILED")
                send_response(
                    {
                        "type": "download_progress",
                        "percent": 100,
                        "filename": "sakura-runtime",
                        "model_id": "sakura-1.5b",
                    }
                )
                try:
                    os.remove(zip_path)
                except Exception:
                    pass
                return True
            except Exception as exc:
                log_message(f"[WARN] Sakura llama.cpp runtime download failed: {exc}")

        raise Exception("LLAMA_RUNTIME_DOWNLOAD_FAILED")

    def _download_runtime_zip(self, url, zip_path):
        tmp_path = zip_path + ".tmp"
        resume_from = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
        if resume_from >= self.runtime_expected_size:
            os.replace(tmp_path, zip_path)
            return

        headers = {
            "User-Agent": "MangaReader/1.4 SakuraRuntimeDownloader",
            "Connection": "close",
        }
        if resume_from > 0:
            headers["Range"] = f"bytes={resume_from}-"
        request = urllib.request.Request(url, headers=headers)

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
                                "filename": "sakura-runtime",
                                "model_id": "sakura-1.5b",
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

    def download_model(self, progress_callback=None):
        log_message(f"[INFO] Downloading SakuraLLM via HuggingFace Hub...")
        log_message(f"   Repo: {self.repo_id}")

        try:
            #  使用上下文管理器，只在下载期间开启“间谍模式”
            with patch_tqdm(
                msg_type="download_progress",
                msg_key="filename",
                default_msg="model",
                extra_fields={"model_id": "sakura-1.5b"},
            ):
                file_path = hf_hub_download(
                    repo_id=self.repo_id,
                    filename=self.filename,
                    local_dir=self.model_dir,
                    # 不再需要 local_dir_use_symlinks=False，
                    # 现在的版本默认行为很智能，保留缓存机制更好
                    token=False,
                )

            log_message("[INFO] SakuraLLM download complete.")
            return True
        except Exception as e:
            log_message(f"[ERROR] Download failed: {e}")
            raise e

    def initialize(self):
        model_path = self.model_file_path

        if self._needs_external_runtime():
            if not os.path.exists(model_path):
                log_message(f"[WARN] Initialize failed. Model not found at: {model_path}")
                self.is_ready = False
                return

            try:
                file_size = os.path.getsize(model_path)
                log_message(f"[DEBUG] Model file size: {file_size} bytes")
                if file_size == 0:
                    log_message(f"[ERROR] Model file is empty: {model_path}")
                    self.is_ready = False
                    return
            except Exception as e:
                log_message(f"[ERROR] Failed to check model file size: {e}")
                self.is_ready = False
                return

            self._ensure_runtime()
            self.use_external_runtime = True
            self.is_ready = True
            log_message("[INFO] SakuraLLM Engine ready via external llama.cpp runtime.")
            return

        llama_class = _get_llama_class()
        if llama_class is None:
            log_message("[ERROR] Error: llama-cpp-python not installed.")
            self.is_ready = False
            return

        if not os.path.exists(model_path):
            log_message(f"[WARN] Initialize failed. Model not found at: {model_path}")
            self.is_ready = False
            return

        # Check file size
        try:
            file_size = os.path.getsize(model_path)
            log_message(f"[DEBUG] Model file size: {file_size} bytes")
            if file_size == 0:
                log_message(f"[ERROR] Model file is empty: {model_path}")
                self.is_ready = False
                return
        except Exception as e:
            log_message(f"[ERROR] Failed to check model file size: {e}")

        try:
            log_message(f"[INFO] Loading SakuraLLM (CPU Mode) from: {model_path}")

            # Force CPU mode to avoid GPU/driver issues causing access violations
            self.llm = llama_class(
                model_path=model_path,
                n_ctx=1024,
                n_threads=4,
                verbose=True,
                n_gpu_layers=0,
            )

            self.use_external_runtime = False
            self.is_ready = True
            log_message("[INFO] SakuraLLM Engine loaded.")
        except Exception as e:
            import traceback

            tb = traceback.format_exc()
            log_message(f"[ERROR] Failed to load Sakura: {e}\nTraceback: {tb}")
            self.is_ready = False

    def translate(self, text):
        if not self.is_ready:
            raise Exception("Sakura Engine not ready")

        with self.lock:
            if self.use_external_runtime:
                return self._translate_with_llama_cli(self._build_chat_prompt(text))

            if not self.llm:
                raise Exception("Sakura Engine not ready")

            system_prompt = "你是一个轻小说翻译模型，可以流畅通顺地以日本轻小说的风格将日文翻译成简体中文，并联系上下文正确使用人称代词，不擅自添加原文中没有的代词。"

            prompt = (
                f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
                f"<|im_start|>user\n将下面的日文文本翻译成中文：{text}<|im_end|>\n"
                f"<|im_start|>assistant\n"
            )

            # ✅ 关键修正：调整推理参数
            output = self.llm(
                prompt,
                max_tokens=512,
                # 1. 扩充停止符：
                #    Added "≒": 日志显示它进入了同义词解释循环
                #    Added "\n": 只要换行就强制停止（短句翻译通常只需要一行）
                stop=["<|im_end|>", "\n\n", "≒", "\n"],
                echo=False,
                temperature=0.1,
                # 2. 增加重复惩罚 (关键!)
                #    frequency_penalty > 0 会惩罚已经出现过的词，防止死循环
                frequency_penalty=0.5,
                presence_penalty=0.3,
                # 3. 限制 top_p 采样，让结果更确定
                top_p=0.9,
            )

            try:
                # 提取结果并再次清洗，防止漏网之鱼
                translation = output["choices"][0]["text"].strip()

                # 双重保险：如果结果里包含了原文，或者长度异常长，可能还是循环了
                # 这里简单处理：取第一行
                if "\n" in translation:
                    translation = translation.split("\n")[0]

                return translation
            except Exception as e:
                log_message(f"Sakura output error: {e}")
                return text

    def _build_chat_prompt(self, text):
        system_prompt = (
            "You are a Japanese-to-Simplified-Chinese light novel and manga translator. "
            "Translate naturally and concisely. Output only the Simplified Chinese translation."
        )
        return (
            f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
            f"<|im_start|>user\nTranslate this Japanese text into Simplified Chinese:\n{text}<|im_end|>\n"
            f"<|im_start|>assistant\n"
        )

    def _translate_with_llama_cli(self, prompt):
        exe_path = self._runtime_exe_path()
        if not self._runtime_exists():
            raise Exception("LLAMA_RUNTIME_NOT_FOUND")

        prompt_file = None
        system_root = os.environ.get("SystemRoot", r"C:\Windows")
        clean_env = {
            "PATH": os.pathsep.join(
                [
                    self.runtime_dir,
                    os.path.join(system_root, "System32"),
                    system_root,
                    os.path.join(system_root, "System32", "Wbem"),
                ]
            ),
            "SystemRoot": system_root,
            "TEMP": os.environ.get("TEMP", ""),
            "TMP": os.environ.get("TMP", ""),
            "OMP_NUM_THREADS": "1",
            "KMP_DUPLICATE_LIB_OK": "TRUE",
        }
        command = [
            exe_path,
            "-m",
            self.model_file_path,
            "-f",
            "",
            "-n",
            "512",
            "-c",
            "1024",
            "-t",
            "4",
            "-ngl",
            "0",
            "--no-mmap",
            "--temp",
            "0.1",
            "--top-p",
            "0.9",
            "--no-display-prompt",
            "--color",
            "off",
            "--no-conversation",
            "--simple-io",
            "--no-warmup",
        ]

        try:
            with tempfile.NamedTemporaryFile(
                "w",
                encoding="utf-8",
                suffix=".txt",
                delete=False,
            ) as temp:
                temp.write(prompt)
                prompt_file = temp.name
            command[command.index("-f") + 1] = prompt_file

            kernel32 = None
            restore_dll_dir = None
            if sys.platform.startswith("win"):
                kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
                restore_dll_dir = getattr(sys, "_MEIPASS", None)
                kernel32.SetDllDirectoryW(self.runtime_dir)

            completed = subprocess.run(
                command,
                cwd=self.runtime_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=clean_env,
                timeout=180,
                creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
            )
        except subprocess.TimeoutExpired:
            raise Exception("SAKURA_TRANSLATION_TIMEOUT")
        finally:
            if "kernel32" in locals() and kernel32 is not None and sys.platform.startswith("win"):
                kernel32.SetDllDirectoryW(restore_dll_dir)
            if prompt_file:
                try:
                    os.remove(prompt_file)
                except Exception:
                    pass

        translation = self._extract_llama_cli_translation(completed.stdout)
        if completed.returncode != 0:
            if translation:
                stderr_tail = "\n".join(completed.stderr.splitlines()[-10:])
                log_message(
                    "[WARN] Sakura llama-cli exited after producing output "
                    f"(exit={completed.returncode}). stderr: {stderr_tail}"
                )
                return translation
            stdout_tail = "\n".join(completed.stdout.splitlines()[-10:])
            stderr_tail = "\n".join(completed.stderr.splitlines()[-10:])
            log_message(
                "[ERROR] Sakura llama-cli failed "
                f"(exit={completed.returncode}). stdout: {stdout_tail} stderr: {stderr_tail}"
            )
            raise Exception("SAKURA_TRANSLATION_FAILED")

        if not translation:
            stdout_tail = repr(completed.stdout[-2000:])
            stderr_tail = repr(completed.stderr[-2000:])
            log_message(
                "[ERROR] Sakura llama-cli returned empty translation. "
                f"stdout_tail={stdout_tail} stderr_tail={stderr_tail}"
            )
            raise Exception("SAKURA_TRANSLATION_EMPTY")
        return translation

    def _extract_llama_cli_translation(self, stdout):
        stdout = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", stdout)
        translation = stdout.replace("\r\n", "\n").replace("\r", "\n").strip()
        assistant_marker = "<|im_start|>assistant"
        if assistant_marker in translation:
            translation = translation.rsplit(assistant_marker, 1)[1].strip()
        if "<|im_end|>" in translation:
            translation = translation.split("<|im_end|>", 1)[0].strip()

        cleaned_lines = []
        for line in translation.split("\n"):
            stripped = line.strip()
            if not stripped:
                continue
            if stripped == ">":
                continue
            if stripped.startswith("[ Prompt:"):
                continue
            if stripped.startswith("Exiting..."):
                continue
            if stripped.startswith(">"):
                stripped = stripped[1:].strip()
            cleaned_lines.append(stripped)

        return "\n".join(cleaned_lines).strip()
