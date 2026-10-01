# services/modules/tokenization/manager.py
# sudachipy 运行时插件: 从 PyPI 拉 wheel, 解出包目录, 校验后安装到 installed/<version>/
# 词典不在这里 (词典由 SudachiDictionaryManager 单独按需下载)
import hashlib
import json
import os
import re
import shutil
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from typing import Any

from ..utils import log_message, send_response


class TokenizationModuleError(Exception):
    pass


class SudachiRuntimeManager:
    NAME = "sudachipy"
    VERSION = "0.6.10"
    # wheel 名里的 abi 标签必须与冻结后端的 CPython 一致 (打包用 python312)
    WHEEL_NAME = f"SudachiPy-{VERSION}-cp312-cp312-win_amd64.whl"
    PACKAGE_MEMBER_PREFIX = "sudachipy/"
    # 索引也给 sha256, 但钉在代码里才不会被镜像或索引本身骗到
    EXPECTED_SHA256 = (
        "4a79b92b0776613481481c1ed0d2e92994b233ed5d29aa365789a1ba521de0a4"
    )
    SIMPLE_INDEXES = [
        "https://pypi.tuna.tsinghua.edu.cn/simple/",
        "https://mirrors.aliyun.com/pypi/simple/",
        "https://pypi.mirrors.ustc.edu.cn/simple/",
        "https://repo.huaweicloud.com/repository/pypi/simple/",
        "https://mirrors.cloud.tencent.com/pypi/simple/",
        "https://pypi.org/simple/",
    ]

    def __init__(self, modules_root: str) -> None:
        self.root = os.path.join(modules_root, "tokenization", "installed", self.VERSION)
        self.package_path = os.path.join(self.root, self.PACKAGE_MEMBER_PREFIX.rstrip("/"))
        self.manifest_path = os.path.join(self.root, "plugin.json")
        self.integrity_path = os.path.join(self.root, "integrity.json")

    # --- 状态 ---

    def is_installed(self) -> bool:
        return os.path.isdir(self.package_path) and os.path.exists(self.integrity_path)

    @property
    def sys_path_entry(self) -> str:
        # 插这一层 (内含 sudachipy/ 包); 插 package_path 会让包里的 .pyd
        # 被当成顶层模块 import 到, 反而盖掉真正的包
        return self.root

    def get_status(self, verify_integrity: bool = False) -> dict[str, Any]:
        installed = self.is_installed()
        status = {
            "name": self.NAME,
            "version": self.VERSION,
            "installed": installed,
            "path": self.root,
        }
        if installed and verify_integrity:
            try:
                status["verified"] = self._verify_integrity()
            except (TokenizationModuleError, OSError, ValueError) as error:
                # integrity.json 自身损坏会抛 JSONDecodeError(ValueError), 同样应降级为未安装
                status["installed"] = False
                status["error"] = str(error)
        return status

    # --- 安装 ---

    def install(self, download_source: str = "mirror") -> bool:
        wheel_url = self._find_wheel_url(download_source)
        with tempfile.TemporaryDirectory() as tmp_dir:
            wheel_path = os.path.join(tmp_dir, self.WHEEL_NAME)
            self._download_file(wheel_url, wheel_path)
            self._check_sha256(wheel_path)
            checksums = self._extract_package(wheel_path, tmp_dir)
        self._write_artifacts(wheel_url, checksums)
        send_response(
            {"type": "tokenization_progress", "percent": 100.0, "stage": "done"}
        )
        log_message(f"[INFO] sudachipy runtime installed at: {self.root}")
        return True

    def uninstall(self) -> bool:
        if os.path.exists(self.root):
            shutil.rmtree(self.root)
            return True
        return False

    # --- 索引与下载 ---

    def _find_wheel_url(self, download_source: str = "mirror") -> str:
        wanted = self.WHEEL_NAME.lower()
        indexes = list(self.SIMPLE_INDEXES)
        if download_source == "official":
            indexes.remove("https://pypi.org/simple/")
            indexes.append("https://pypi.org/simple/")
        last_error: Exception | None = None
        for base_url in indexes:
            index_url = urllib.parse.urljoin(base_url, "sudachipy/")
            try:
                log_message(f"[INFO] Checking sudachipy index: {index_url}")
                with urllib.request.urlopen(
                    urllib.request.Request(
                        index_url, headers={"User-Agent": self._user_agent()}
                    ),
                    timeout=20,
                ) as response:
                    html = response.read().decode("utf-8", "replace")
                for href in self._parse_index_links(html):
                    link = urllib.parse.urljoin(index_url, href)
                    filename = os.path.basename(
                        urllib.parse.unquote(urllib.parse.urlparse(link).path)
                    )
                    if filename.lower() == wanted:
                        return link
            except Exception as exc:
                last_error = exc
                log_message(f"[WARN] sudachipy index failed: {exc}")
        raise TokenizationModuleError(
            f"TOKENIZATION_DOWNLOAD_SOURCE_UNAVAILABLE: {last_error}"
        )

    @staticmethod
    def _parse_index_links(html: str) -> list[str]:
        return re.findall(r'href="([^"]+)"', html)

    def _download_file(self, url: str, target_path: str) -> None:
        request = urllib.request.Request(
            url, headers={"User-Agent": self._user_agent()}
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            total = int(response.headers.get("Content-Length") or 0)
            downloaded = 0
            with open(target_path, "wb") as output:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        send_response(
                            {
                                "type": "tokenization_progress",
                                "percent": round(downloaded / total * 99.0, 1),
                                "stage": "download",
                            }
                        )

    @staticmethod
    def _user_agent() -> str:
        return "MangaReader/1.5 SudachiRuntimeDownloader"

    # --- 校验与解包 ---

    def _check_sha256(self, file_path: str) -> str:
        actual = self._sha256(file_path)
        if self.EXPECTED_SHA256 and actual.lower() != self.EXPECTED_SHA256.lower():
            raise TokenizationModuleError(
                f"TOKENIZATION_SHA256_MISMATCH: expected {self.EXPECTED_SHA256} got {actual}"
            )
        return actual

    def _extract_package(self, wheel_path: str, tmp_dir: str) -> dict[str, str]:
        staging = os.path.join(tmp_dir, "staged")
        os.makedirs(staging, exist_ok=True)
        checksums: dict[str, str] = {}
        with zipfile.ZipFile(wheel_path) as wheel:
            for member in wheel.infolist():
                if not member.filename.startswith(self.PACKAGE_MEMBER_PREFIX):
                    continue
                if member.is_dir():
                    continue
                relative = member.filename[len(self.PACKAGE_MEMBER_PREFIX):]
                destination = self._resolve_within(staging, relative)
                os.makedirs(os.path.dirname(destination), exist_ok=True)
                with wheel.open(member) as source, open(destination, "wb") as target:
                    shutil.copyfileobj(source, target)
                checksums[relative.replace("\\", "/")] = self._sha256(destination)
        if not checksums:
            raise TokenizationModuleError("TOKENIZATION_PACKAGE_EMPTY")

        if os.path.exists(self.root):
            shutil.rmtree(self.root)
        os.makedirs(self.root, exist_ok=True)
        shutil.copytree(
            staging, os.path.join(self.package_path), dirs_exist_ok=True
        )
        return checksums

    @staticmethod
    def _resolve_within(root: str, relative_path: str) -> str:
        # 防 zip slip: wheel 里的成员名可能带 .. 或绝对路径
        target = os.path.realpath(os.path.join(root, relative_path))
        prefix = os.path.realpath(root) + os.sep
        if not target.startswith(prefix):
            raise TokenizationModuleError(f"TOKENIZATION_UNSAFE_MEMBER: {relative_path}")
        return target

    @staticmethod
    def _sha256(file_path: str) -> str:
        digest = hashlib.sha256()
        with open(file_path, "rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _write_artifacts(self, source_url: str, checksums: dict[str, str]) -> None:
        with open(self.integrity_path, "w", encoding="utf-8") as file:
            json.dump(
                {"algorithm": "sha256", "files": checksums},
                file,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
        with open(self.manifest_path, "w", encoding="utf-8") as file:
            json.dump(
                {
                    "name": self.NAME,
                    "version": self.VERSION,
                    "wheel": self.WHEEL_NAME,
                    "source": source_url,
                    "license": "Apache-2.0",
                    "runtime": {"python": "cp312", "platform": "win_amd64"},
                },
                file,
                ensure_ascii=False,
                indent=2,
            )

    def verify_integrity(self) -> bool:
        return self._verify_integrity()

    def _verify_integrity(self) -> bool:
        if not os.path.exists(self.integrity_path):
            raise TokenizationModuleError("TOKENIZATION_INTEGRITY_MISSING")
        with open(self.integrity_path, encoding="utf-8") as file:
            manifest = json.load(file)
        for relative, expected in manifest.get("files", {}).items():
            path = self._resolve_within(self.package_path, relative)
            if not os.path.exists(path):
                raise TokenizationModuleError(f"TOKENIZATION_FILE_MISSING: {relative}")
            if self._sha256(path).lower() != expected.lower():
                raise TokenizationModuleError(f"TOKENIZATION_FILE_MODIFIED: {relative}")
        return True
