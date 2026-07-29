import hashlib
import json
import os
import re
import shutil
import stat
import urllib.request
import uuid
import zipfile
from pathlib import Path


MODULE_ID = "ctd-detector"
SUPPORTED_API_VERSION = 1
RELEASE_URL = os.environ.get("MANGAREADER_CTD_MODULE_URL", "").strip()
RELEASE_SHA256 = os.environ.get("MANGAREADER_CTD_MODULE_SHA256", "").strip().lower()


class DetectionModuleError(RuntimeError):
    pass


class DetectionModuleManager:
    def __init__(self, modules_root):
        self.module_root = Path(modules_root).resolve() / "text_detection"
        self.installed_root = self.module_root / "installed" / MODULE_ID
        self.download_root = self.module_root / ".downloads"

    @property
    def release_configured(self):
        return bool(
            RELEASE_URL.startswith("https://")
            and re.fullmatch(r"[0-9a-f]{64}", RELEASE_SHA256)
        )

    def get_status(self):
        installed = self.get_installed_module()
        status = {
            "installed": installed is not None,
            "available": self.release_configured,
            "version": installed["manifest"]["version"] if installed else "",
            "module_path": str(installed["path"]) if installed else "",
        }
        if not self.release_configured:
            status["message"] = "检测模块发布地址与 SHA-256 尚未配置"
        return status

    def get_installed_module(self):
        if not self.installed_root.exists():
            return None

        candidates = []
        for child in self.installed_root.iterdir():
            if not child.is_dir() or child.name.startswith("."):
                continue
            try:
                manifest = self._validate_module(child)
                candidates.append((self._version_key(manifest["version"]), child, manifest))
            except DetectionModuleError:
                continue

        if not candidates:
            return None
        _, path, manifest = max(candidates, key=lambda item: item[0])
        return {"path": path, "manifest": manifest}

    def install(self, progress_callback=None):
        if not self.release_configured:
            raise DetectionModuleError("DETECTION_MODULE_RELEASE_NOT_CONFIGURED")

        self.download_root.mkdir(parents=True, exist_ok=True)
        archive_path = self.download_root / f"{MODULE_ID}.zip.part"
        staging_path = self.installed_root / f".install-{uuid.uuid4().hex}"

        try:
            self._download(archive_path, progress_callback)
            self._emit_progress(progress_callback, 92, "verifying")
            self._verify_sha256(archive_path, RELEASE_SHA256)

            staging_path.mkdir(parents=True, exist_ok=False)
            self._emit_progress(progress_callback, 96, "installing")
            self._safe_extract(archive_path, staging_path)
            package_root = self._find_package_root(staging_path)
            manifest = self._validate_module(package_root, verify_hashes=True)

            destination = self.installed_root / manifest["version"]
            if destination.exists():
                shutil.rmtree(destination)
            destination.parent.mkdir(parents=True, exist_ok=True)

            if package_root == staging_path:
                os.replace(staging_path, destination)
            else:
                os.replace(package_root, destination)
                shutil.rmtree(staging_path, ignore_errors=True)

            self._validate_module(destination, verify_hashes=True)
            self._emit_progress(progress_callback, 100, "complete")
            return self.get_status()
        finally:
            archive_path.unlink(missing_ok=True)
            shutil.rmtree(staging_path, ignore_errors=True)

    def delete(self):
        if self.installed_root.exists():
            shutil.rmtree(self.installed_root)
        return True

    def delete_version(self, version):
        if not self._valid_version(version):
            return
        version_path = self.installed_root / str(version)
        if version_path.exists():
            shutil.rmtree(version_path)

    def _download(self, destination, progress_callback):
        existing_size = destination.stat().st_size if destination.exists() else 0
        headers = {"User-Agent": "MangaReader-DetectionModule/1"}
        if existing_size:
            headers["Range"] = f"bytes={existing_size}-"

        request = urllib.request.Request(RELEASE_URL, headers=headers)
        with urllib.request.urlopen(request, timeout=60) as response:
            if not response.geturl().startswith("https://"):
                raise DetectionModuleError("检测模块下载地址必须使用 HTTPS")
            is_partial = getattr(response, "status", None) == 206
            if existing_size and not is_partial:
                existing_size = 0
            content_length = int(response.headers.get("Content-Length", "0"))
            total_size = existing_size + content_length if content_length else 0
            mode = "ab" if is_partial else "wb"
            downloaded = existing_size

            with open(destination, mode) as archive_file:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    archive_file.write(chunk)
                    downloaded += len(chunk)
                    if total_size:
                        percent = min(90, downloaded / total_size * 90)
                        self._emit_progress(progress_callback, percent, "downloading")

    def _safe_extract(self, archive_path, destination):
        destination = destination.resolve()
        with zipfile.ZipFile(archive_path) as archive:
            for member in archive.infolist():
                member_path = Path(member.filename)
                if member_path.is_absolute() or ".." in member_path.parts:
                    raise DetectionModuleError("检测模块压缩包包含不安全路径")
                mode = member.external_attr >> 16
                if stat.S_ISLNK(mode):
                    raise DetectionModuleError("检测模块压缩包不允许包含符号链接")
                target = (destination / member_path).resolve()
                if destination != target and destination not in target.parents:
                    raise DetectionModuleError("检测模块压缩包路径越界")
            archive.extractall(destination)

    def _find_package_root(self, staging_path):
        if (staging_path / "plugin.json").is_file():
            return staging_path
        candidates = [
            path.parent for path in staging_path.glob("*/plugin.json") if path.is_file()
        ]
        if len(candidates) != 1:
            raise DetectionModuleError("检测模块压缩包必须包含唯一的 plugin.json")
        return candidates[0]

    def _validate_module(self, module_path, verify_hashes=False):
        manifest_path = module_path / "plugin.json"
        if not manifest_path.is_file():
            raise DetectionModuleError("检测模块缺少 plugin.json")
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise DetectionModuleError(f"检测模块清单无效: {error}") from error

        if manifest.get("id") != MODULE_ID:
            raise DetectionModuleError("检测模块 ID 不匹配")
        if manifest.get("apiVersion") != SUPPORTED_API_VERSION:
            raise DetectionModuleError("检测模块 API 版本不兼容")
        version = manifest.get("version")
        if not self._valid_version(version):
            raise DetectionModuleError("检测模块版本无效")

        for field in ("entry", "model"):
            relative_path = manifest.get(field)
            if not isinstance(relative_path, str):
                raise DetectionModuleError(f"检测模块缺少 {field}")
            self._resolve_member(module_path, relative_path)

        python_paths = manifest.get("pythonPaths", [])
        if not isinstance(python_paths, list):
            raise DetectionModuleError("检测模块 pythonPaths 必须是数组")
        for relative_path in python_paths:
            self._resolve_directory(module_path, relative_path)

        if not (module_path / "LICENSE").is_file():
            raise DetectionModuleError("检测模块缺少 LICENSE")

        file_hashes = manifest.get("sha256")
        if not isinstance(file_hashes, dict) or manifest["model"] not in file_hashes:
            raise DetectionModuleError("检测模块必须提供模型文件 SHA-256")
        if verify_hashes:
            for relative_path, expected_hash in file_hashes.items():
                member_path = self._resolve_member(module_path, relative_path)
                self._verify_sha256(member_path, expected_hash)

        return manifest

    def _resolve_member(self, module_path, relative_path):
        module_path = module_path.resolve()
        member_path = (module_path / relative_path).resolve()
        if module_path not in member_path.parents or not member_path.is_file():
            raise DetectionModuleError(f"检测模块文件无效: {relative_path}")
        return member_path

    def _resolve_directory(self, module_path, relative_path):
        if not isinstance(relative_path, str):
            raise DetectionModuleError("检测模块依赖目录无效")
        module_path = module_path.resolve()
        directory_path = (module_path / relative_path).resolve()
        if module_path not in directory_path.parents or not directory_path.is_dir():
            raise DetectionModuleError(f"检测模块依赖目录无效: {relative_path}")
        return directory_path

    @staticmethod
    def _verify_sha256(file_path, expected_hash):
        expected_hash = str(expected_hash).lower()
        if len(expected_hash) != 64:
            raise DetectionModuleError("检测模块 SHA-256 配置无效")
        digest = hashlib.sha256()
        with open(file_path, "rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected_hash:
            raise DetectionModuleError(f"检测模块文件校验失败: {file_path.name}")

    @staticmethod
    def _version_key(version):
        parts = []
        for part in str(version).split("."):
            parts.append((0, int(part)) if part.isdigit() else (1, part))
        return tuple(parts)

    @staticmethod
    def _valid_version(version):
        return isinstance(version, str) and bool(
            re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._-]{0,63}", version)
        )

    @staticmethod
    def _emit_progress(callback, percent, stage):
        if callback:
            callback({"percent": round(percent, 1), "stage": stage})
