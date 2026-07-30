# services/modules/ocr_engine.py
import os
import base64
import sys
import json
import contextlib
from io import BytesIO
from PIL import Image
from manga_ocr import MangaOcr
from huggingface_hub import snapshot_download
from .utils import log_message, patch_tqdm


class OCRDownloadError(RuntimeError):
    all_sources_failed = True


class OCREngine:
    def __init__(self, model_dir=None, download_source="mirror"):
        self.mocr = None
        # 如果没有传入路径，抛出错误，因为我们现在的策略是必须指定路径
        if not model_dir:
            raise ValueError("Model directory is required for cleaner deployment.")

        self.model_dir = model_dir
        self.download_source = (
            "official" if download_source == "official" else "mirror"
        )

        # 强制使用 CPU，避免 CUDA 初始化带来的不确定性 (除非用户明确有 CUDA 环境)
        # 对于 MangaOCR 这种轻量级模型，CPU 足够快且更稳定
        # os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

        self._load_model()

    def _check_integrity(self):
        """检查本地模型文件是否完整"""
        if not os.path.exists(self.model_dir):
            return False

        # 关键文件列表
        required_files = [
            "config.json",
            "preprocessor_config.json",
            "tokenizer_config.json",
        ]

        # 1. 检查小文件
        for f in required_files:
            file_path = os.path.join(self.model_dir, f)
            if not os.path.exists(file_path):
                log_message(f"Missing file: {f}")
                return False
            if os.path.getsize(file_path) == 0:
                log_message(f"File is empty: {f}")
                return False

        # 2. 检查词表文件 (兼容 vocab.txt 和 sentencepiece.bpe.model)
        # 修正：如果存在 tokenizer.json，则不需要 vocab.txt 或 sentencepiece.bpe.model
        # 因为我们将强制使用 use_fast=True
        has_tokenizer_json = os.path.exists(
            os.path.join(self.model_dir, "tokenizer.json")
        )
        has_vocab = os.path.exists(os.path.join(self.model_dir, "vocab.txt"))
        has_spm = os.path.exists(
            os.path.join(self.model_dir, "sentencepiece.bpe.model")
        )

        if not (has_tokenizer_json or has_vocab or has_spm):
            log_message(
                "Missing vocabulary file (tokenizer.json, vocab.txt or sentencepiece.bpe.model)"
            )
            return False

        # 3. 检查大权重文件 (safetensors 是新标准，bin 是旧标准，兼容一下)
        has_safetensors = os.path.exists(
            os.path.join(self.model_dir, "model.safetensors")
        )
        has_bin = os.path.exists(os.path.join(self.model_dir, "pytorch_model.bin"))

        if not (has_safetensors or has_bin):
            log_message(
                "Missing model weights (model.safetensors or pytorch_model.bin)"
            )
            return False

        return True

    def _load_model(self):
        # 1. 检查本地是否存在且完整
        if self._check_integrity():
            log_message(f"[INFO] Found valid model at: {self.model_dir}")
        else:
            # 2. 本地不完整，执行定向下载
            log_message(
                f"[INFO] Model missing or incomplete. Downloading to {self.model_dir}..."
            )
            log_message("[INFO] This may take a while (approx 400MB)...")

            endpoints = {
                "mirror": "https://hf-mirror.com",
                "official": "https://huggingface.co",
            }
            source_order = [
                self.download_source,
                "official" if self.download_source == "mirror" else "mirror",
            ]
            errors = []
            for source_index, source in enumerate(source_order):
                endpoint = endpoints[source]
                source_label = "镜像源" if source == "mirror" else "官方源"
                os.environ["HF_ENDPOINT"] = endpoint
                log_message(f"[INFO] Connecting to OCR {source_label}: {endpoint}")
                try:
                    with patch_tqdm(
                        msg_type="init_progress",
                        msg_key="message",
                        default_msg=f"正在通过{source_label}下载 OCR 模型...",
                    ):
                        snapshot_download(
                            repo_id="kha-white/manga-ocr-base",
                            local_dir=self.model_dir,
                            local_dir_use_symlinks=False,
                            endpoint=endpoint,
                        )
                    log_message(f"[INFO] OCR download completed via {source_label}.")
                    break
                except Exception as error:
                    errors.append(f"{source_label}: {error}")
                    log_message(f"[WARNING] OCR {source_label} download failed: {error}")
                    if source_index == 0:
                        log_message("[INFO] Switching OCR download source...")
            else:
                raise OCRDownloadError("；".join(errors))

        # 3. 加载模型 (此时文件一定在本地了)
        abs_model_path = os.path.abspath(self.model_dir)
        log_message(f"[INFO] Loading OCR Engine from local storage: {abs_model_path}")

        try:
            with patch_tqdm(
                msg_type="init_progress",
                msg_key="message",
                default_msg="正在加载 OCR 引擎...",
            ):
                # 强制指定 local_files_only=True，因为我们刚才已经确认下载了
                self.mocr = MangaOcr(pretrained_model_name_or_path=abs_model_path)
            log_message("MangaOCR Initialized Successfully.")
        except Exception as e:
            log_message(f"[ERROR] MangaOCR Load Failed: {e}")
            raise e

    def recognize(self, image_base64):
        """执行 OCR"""
        if not self.mocr:
            raise Exception("OCR Model not initialized")

        # 处理 Base64
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]

        image_data = base64.b64decode(image_base64)
        img = Image.open(BytesIO(image_data))

        # [FIX] Add padding to improve OCR accuracy on tight crops
        # MangaOCR works best when there is some white space around the text
        if img.mode != "RGB":
            img = img.convert("RGB")

        padding = 20
        new_width = img.width + 2 * padding
        new_height = img.height + 2 * padding

        new_img = Image.new("RGB", (new_width, new_height), (255, 255, 255))
        new_img.paste(img, (padding, padding))

        return self.mocr(new_img)
