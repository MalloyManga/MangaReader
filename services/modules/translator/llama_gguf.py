# services/modules/translator/llama_gguf.py
# Sakura 与 Qwen3 两个 GGUF 翻译引擎共享的 llama.cpp 运行时
# 1. 打包环境下 llama-cpp-python 的动态库发现与懒加载
# 2. 外置 llama.cpp runtime 的下载 校验 解压(打包版 exe 不带 python 绑定 用 llama-cli.exe 推理)
# 3. llama-cli 子进程调用与输出清洗
import ctypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

from ..utils import log_message, send_response

# runtime 包固定为 llama.cpp b9966 win-cpu-x64 预编译版 与引擎无关 两个引擎共用
RUNTIME_ZIP_NAME = "llama-b9966-bin-win-cpu-x64.zip"
RUNTIME_EXPECTED_SIZE = 18211851
RUNTIME_DOWNLOAD_URLS = [
    "https://gh.llkk.cc/https://github.com/ggml-org/llama.cpp/releases/download/b9966/llama-b9966-bin-win-cpu-x64.zip",
    "https://github.com/ggml-org/llama.cpp/releases/download/b9966/llama-b9966-bin-win-cpu-x64.zip",
]

# llama_cpp.Llama 类缓存 全部引擎共享一份
_Llama = None


def prepare_llama_cpp_runtime():
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


def get_llama_class():
    global _Llama
    if _Llama is None:
        prepare_llama_cpp_runtime()
        try:
            from llama_cpp import Llama as LlamaClass
        except ImportError:
            return None
        _Llama = LlamaClass
    return _Llama


class LlamaCppRuntime:
    """打包环境专用的外置 llama.cpp runtime 管理

    每个引擎的 runtime 目录位于 model_dir/runtime/llama-cpp-win-cpu-x64 按需下载安装
    开发环境 needs_external() 返回 False 引擎走 llama-cpp-python 进程内加载 本类不参与
    progress_filename/model_id 用于下载进度事件 log_prefix 用于日志区分引擎
    """

    def __init__(self, model_dir, progress_filename, model_id, log_prefix):
        self.model_dir = model_dir
        self.runtime_dir = os.path.join(model_dir, "runtime", "llama-cpp-win-cpu-x64")
        self.progress_filename = progress_filename
        self.model_id = model_id
        self.log_prefix = log_prefix

    @staticmethod
    def needs_external():
        return getattr(sys, "frozen", False) and sys.platform.startswith("win")

    def exe_path(self):
        return os.path.join(self.runtime_dir, "llama-cli.exe")

    def exists(self):
        exe_path = self.exe_path()
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

    def ensure(self):
        if self.exists():
            return True

        os.makedirs(self.runtime_dir, exist_ok=True)
        zip_path = os.path.join(self.model_dir, RUNTIME_ZIP_NAME)

        for url in RUNTIME_DOWNLOAD_URLS:
            try:
                log_message(f"[INFO] Downloading llama.cpp runtime for {self.log_prefix}: {url}")
                self._download_zip(url, zip_path)
                self._extract_zip(zip_path)
                if not self.exists():
                    raise Exception("LLAMA_RUNTIME_INSTALL_FAILED")
                send_response(
                    {
                        "type": "download_progress",
                        "percent": 100,
                        "filename": self.progress_filename,
                        "model_id": self.model_id,
                    }
                )
                try:
                    os.remove(zip_path)
                except Exception:
                    pass
                return True
            except Exception as exc:
                log_message(f"[WARN] {self.log_prefix} llama.cpp runtime download failed: {exc}")

        raise Exception("LLAMA_RUNTIME_DOWNLOAD_FAILED")

    def _download_zip(self, url, zip_path):
        tmp_path = zip_path + ".tmp"
        resume_from = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
        if resume_from >= RUNTIME_EXPECTED_SIZE:
            os.replace(tmp_path, zip_path)
            return

        headers = {
            "User-Agent": "MangaReader/1.4 LlamaCppRuntimeDownloader",
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
                    percent = round(downloaded / RUNTIME_EXPECTED_SIZE * 100, 1)
                    step = int(percent * 2)
                    if step > last_percent_step:
                        last_percent_step = step
                        send_response(
                            {
                                "type": "download_progress",
                                "percent": min(percent, 99.0),
                                "filename": self.progress_filename,
                                "model_id": self.model_id,
                                "stage": "runtime",
                            }
                        )

        downloaded = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
        if downloaded < RUNTIME_EXPECTED_SIZE * 0.9:
            raise Exception(f"incomplete runtime download: {downloaded} bytes")

        os.replace(tmp_path, zip_path)

    def _extract_zip(self, zip_path):
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

    def translate_with_cli(self, prompt, model_file_path, context_window, error_prefix, timeout=180):
        """调用 llama-cli 完成一次翻译

        error_prefix 决定错误名 例如 SAKURA_TRANSLATION 生成
        SAKURA_TRANSLATION_TIMEOUT / SAKURA_TRANSLATION_FAILED / SAKURA_TRANSLATION_EMPTY
        这些错误名会原样到达前端 不能随意改动
        """
        if not self.exists():
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
            self.exe_path(),
            "-m",
            model_file_path,
            "-f",
            "",
            "-n",
            "512",
            "-c",
            str(context_window),
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
                timeout=timeout,
                creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
            )
        except subprocess.TimeoutExpired:
            raise Exception(f"{error_prefix}_TIMEOUT")
        finally:
            if "kernel32" in locals() and kernel32 is not None and sys.platform.startswith("win"):
                kernel32.SetDllDirectoryW(restore_dll_dir)
            if prompt_file:
                try:
                    os.remove(prompt_file)
                except Exception:
                    pass

        translation = self.extract_cli_translation(completed.stdout)
        if completed.returncode != 0:
            if translation:
                stderr_tail = "\n".join(completed.stderr.splitlines()[-10:])
                log_message(
                    f"[WARN] {self.log_prefix} llama-cli exited after producing output "
                    f"(exit={completed.returncode}). stderr: {stderr_tail}"
                )
                return translation
            stdout_tail = "\n".join(completed.stdout.splitlines()[-10:])
            stderr_tail = "\n".join(completed.stderr.splitlines()[-10:])
            log_message(
                f"[ERROR] {self.log_prefix} llama-cli failed "
                f"(exit={completed.returncode}). stdout: {stdout_tail} stderr: {stderr_tail}"
            )
            raise Exception(f"{error_prefix}_FAILED")

        if not translation:
            stdout_tail = repr(completed.stdout[-2000:])
            stderr_tail = repr(completed.stderr[-2000:])
            log_message(
                f"[ERROR] {self.log_prefix} llama-cli returned empty translation. "
                f"stdout_tail={stdout_tail} stderr_tail={stderr_tail}"
            )
            raise Exception(f"{error_prefix}_EMPTY")
        return translation

    @staticmethod
    def extract_cli_translation(stdout):
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
