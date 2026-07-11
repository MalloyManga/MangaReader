# services/modules/translator/sakura_engine.py
import os
import threading
import shutil
import sys
import json
import contextlib
from .base import BaseTranslator
from huggingface_hub import hf_hub_download
from ..utils import log_message, patch_tqdm

try:
    from llama_cpp import Llama
except ImportError:
    Llama = None


class SakuraEngine(BaseTranslator):
    def __init__(self, model_root_dir):
        path = os.path.join(model_root_dir, "sakura")
        super().__init__(path)

        self.repo_id = "shing3232/Sakura-1.5B-Qwen2.5-v1.0-GGUF-IMX"
        self.filename = "sakura-1.5b-qwen2.5-v1.0-Q5KS.gguf"

        # 为了更准确的判断，我们这里还是用 .gguf 结尾的文件路径
        self.model_file_path = os.path.join(self.model_dir, self.filename)

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

        return deleted

    def download_model(self, progress_callback=None):
        log_message(f"[INFO] Downloading SakuraLLM via HuggingFace Hub...")
        log_message(f"   Repo: {self.repo_id}")

        try:
            #  使用上下文管理器，只在下载期间开启“间谍模式”
            with patch_tqdm(
                msg_type="download_progress", msg_key="filename", default_msg="model"
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
        if Llama is None:
            log_message("[ERROR] Error: llama-cpp-python not installed.")
            self.is_ready = False
            return

        model_path = self.model_file_path

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
            self.llm = Llama(
                model_path=model_path,
                n_ctx=1024,
                n_threads=4,
                verbose=True,
                n_gpu_layers=0,
            )

            self.is_ready = True
            log_message("[INFO] SakuraLLM Engine loaded.")
        except Exception as e:
            import traceback

            tb = traceback.format_exc()
            log_message(f"[ERROR] Failed to load Sakura: {e}\nTraceback: {tb}")
            self.is_ready = False

    def translate(self, text):
        if not self.is_ready or not self.llm:
            raise Exception("Sakura Engine not ready")

        with self.lock:
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
