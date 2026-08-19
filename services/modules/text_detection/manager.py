import hashlib
import json
import os
import re
import shutil
import stat
import time
import urllib.request
import urllib.error
import uuid
import zipfile
from pathlib import Path


MODULE_ID = "ctd-detector"
MODULE_VERSION = "1.0.0"
SUPPORTED_API_VERSION = 1

# Third-party files are downloaded from their upstream distribution channels.
OFFICIAL_ASSETS = (
    {
        "id": "ctd-source",
        "name": "CTD 检测代码",
        "filename": "comic-text-detector-440b978563c71b758e31aaa315d100faba1efa2f.zip",
        "url": "https://codeload.github.com/dmMaze/comic-text-detector/zip/440b978563c71b758e31aaa315d100faba1efa2f",
        "mirrors": (
            "https://gh-proxy.com/https://github.com/dmMaze/comic-text-detector/archive/440b978563c71b758e31aaa315d100faba1efa2f.zip",
        ),
        "sha256": "3c0f355c2bbafe74ceee61a108d83b2bc197c2e786a90341707b1a01e62e2ebf",
        "size": 6547271,
        "kind": "source",
    },
    {
        "id": "ctd-model",
        "name": "CTD PyTorch 模型",
        "filename": "comictextdetector.pt",
        "url": "https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.2.1/comictextdetector.pt",
        "mirrors": (
            "https://gh-proxy.com/https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.2.1/comictextdetector.pt",
        ),
        "sha256": "1f90fa60aeeb1eb82e2ac1167a66bf139a8a61b8780acd351ead55268540cccb",
        "size": 79948869,
        "kind": "model",
    },
    {
        "id": "opencv",
        "name": "OpenCV 运行时",
        "filename": "opencv_python_headless-4.10.0.84-cp37-abi3-win_amd64.whl",
        "url": "https://files.pythonhosted.org/packages/26/d0/22f68eb23eea053a31655960f133c0be9726c6a881547e6e9e7e2a946c4f/opencv_python_headless-4.10.0.84-cp37-abi3-win_amd64.whl",
        "mirrors": (
            "https://mirrors.aliyun.com/pypi/packages/26/d0/22f68eb23eea053a31655960f133c0be9726c6a881547e6e9e7e2a946c4f/opencv_python_headless-4.10.0.84-cp37-abi3-win_amd64.whl",
        ),
        "sha256": "afcf28bd1209dd58810d33defb622b325d3cbe49dcd7a43a902982c33e5fad05",
        "size": 38754031,
        "kind": "wheel",
    },
    {
        "id": "torchvision",
        "name": "Torchvision 运行时",
        "filename": "torchvision-0.17.2-cp312-cp312-win_amd64.whl",
        "url": "https://files.pythonhosted.org/packages/fd/d1/8da7f30169f56764f0ef9ed961a32f300a2d782b6c1bc8b391c3014092f8/torchvision-0.17.2-cp312-cp312-win_amd64.whl",
        "mirrors": (
            "https://mirrors.aliyun.com/pypi/packages/fd/d1/8da7f30169f56764f0ef9ed961a32f300a2d782b6c1bc8b391c3014092f8/torchvision-0.17.2-cp312-cp312-win_amd64.whl",
        ),
        "sha256": "3f784381419f3ed3f2ec2aa42fb4aeec5bf4135e298d1631e41c926e6f1a0dff",
        "size": 1165531,
        "kind": "torchvision-wheel",
    },
)


class DetectionModuleError(RuntimeError):
    pass


class DetectionModuleManager:
    def __init__(self, modules_root):
        self.module_root = Path(modules_root).resolve() / "text_detection"
        self.installed_root = self.module_root / "installed" / MODULE_ID
        self.download_root = self.module_root / ".downloads"

    def get_status(self, verify_integrity=False):
        corrupted = False
        message = ""
        installed = self.get_installed_module()
        version_path = self.installed_root / MODULE_VERSION
        if installed is None and version_path.exists():
            corrupted = True
            message = "检测模块文件不完整，需要重新下载"
        if installed and verify_integrity:
            try:
                self.verify_integrity(installed["path"])
            except DetectionModuleError as error:
                installed = None
                corrupted = True
                message = str(error)

        return {
            "installed": installed is not None,
            "available": True,
            "corrupted": corrupted,
            "version": installed["manifest"]["version"] if installed else "",
            "module_path": str(installed["path"]) if installed else "",
            "message": message,
        }

    def get_installed_module(self):
        version_path = self.installed_root / MODULE_VERSION
        if not version_path.is_dir():
            return None
        try:
            return {
                "path": version_path,
                "manifest": self._validate_structure(version_path),
            }
        except DetectionModuleError:
            return None

    def install(self, progress_callback=None, download_source="mirror"):
        self.download_root.mkdir(parents=True, exist_ok=True)
        staging_path = self.installed_root / f".install-{uuid.uuid4().hex}"
        downloaded_assets = {}

        try:
            total_size = sum(asset["size"] for asset in OFFICIAL_ASSETS if asset["size"])
            completed_size = 0
            for asset in OFFICIAL_ASSETS:
                asset_path = self.download_root / f"{asset['filename']}.part"
                self._download_asset(
                    asset,
                    asset_path,
                    completed_size,
                    total_size,
                    progress_callback,
                    download_source,
                )
                try:
                    self._verify_sha256(asset_path, asset["sha256"])
                except DetectionModuleError:
                    asset_path.unlink(missing_ok=True)
                    raise
                downloaded_assets[asset["kind"]] = asset_path
                completed_size += asset["size"] or asset_path.stat().st_size

            self._emit_progress(progress_callback, 90, "verifying", "正在校验下载文件")
            staging_path.mkdir(parents=True, exist_ok=False)
            self._assemble_module(staging_path, downloaded_assets)
            self._emit_progress(progress_callback, 96, "installing", "正在生成完整性清单")
            self._write_integrity_manifest(staging_path)
            self.verify_integrity(staging_path)

            destination = self.installed_root / MODULE_VERSION
            backup = self.installed_root / f".backup-{uuid.uuid4().hex}"
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                self._replace_path(destination, backup)
            try:
                self._replace_path(staging_path, destination)
                self.verify_integrity(destination)
            except Exception:
                if destination.exists():
                    shutil.rmtree(destination, ignore_errors=True)
                if backup.exists():
                    self._replace_path(backup, destination)
                raise
            finally:
                shutil.rmtree(backup, ignore_errors=True)

            for asset_path in downloaded_assets.values():
                asset_path.unlink(missing_ok=True)
            self._emit_progress(progress_callback, 100, "complete", "检测模块安装完成")
            return self.get_status(verify_integrity=True)
        finally:
            shutil.rmtree(staging_path, ignore_errors=True)

    def delete(self):
        if self.installed_root.exists():
            shutil.rmtree(self.installed_root)
        if self.download_root.exists():
            shutil.rmtree(self.download_root)
        return True

    def verify_integrity(self, module_path):
        module_path = Path(module_path).resolve()
        self._validate_structure(module_path)
        integrity_path = module_path / "integrity.json"
        try:
            integrity = json.loads(integrity_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise DetectionModuleError("检测模块完整性清单缺失或无效") from error

        files = integrity.get("files")
        if not isinstance(files, dict) or not files:
            raise DetectionModuleError("检测模块完整性清单为空")

        expected_paths = set(files)
        actual_paths = {
            path.relative_to(module_path).as_posix()
            for path in module_path.rglob("*")
            if path.is_file()
            and path.name != "integrity.json"
            and "__pycache__" not in path.parts
            and path.suffix != ".pyc"
        }
        if actual_paths != expected_paths:
            raise DetectionModuleError("检测模块文件不完整，需要重新下载")

        for relative_path, metadata in files.items():
            file_path = self._resolve_member(module_path, relative_path)
            if file_path.stat().st_size != metadata.get("size"):
                raise DetectionModuleError(f"检测模块文件大小异常: {relative_path}")
        return True

    def _download_asset(
        self,
        asset,
        destination,
        completed_size,
        total_size,
        progress_callback,
        download_source="mirror",
    ):
        if destination.exists():
            existing_size = destination.stat().st_size
            if asset["size"] and existing_size == asset["size"]:
                try:
                    self._verify_sha256(destination, asset["sha256"])
                    self._emit_download_progress(
                        progress_callback,
                        completed_size + existing_size,
                        total_size,
                        asset["name"],
                    )
                    return
                except DetectionModuleError:
                    destination.unlink(missing_ok=True)
            elif asset["size"] and existing_size > asset["size"]:
                destination.unlink(missing_ok=True)

        mirror_sources = [
            (url, "镜像源") for url in (asset.get("mirrors") or ())
        ]
        official_sources = [(asset["url"], "官方源")]
        sources = (
            official_sources + mirror_sources
            if download_source == "official"
            else mirror_sources + official_sources
        )
        last_error = None
        for source_index, (source_url, source_name) in enumerate(sources):
            self._emit_progress(
                progress_callback,
                completed_size / max(total_size, 1) * 88,
                "connecting",
                f"正在连接{source_name}：{asset['name']}",
            )
            try:
                self._download_from_source(
                    asset,
                    source_url,
                    source_name,
                    destination,
                    completed_size,
                    total_size,
                    progress_callback,
                )
                if asset["size"] and destination.stat().st_size != asset["size"]:
                    raise DetectionModuleError(
                        f"下载文件大小异常: {asset['filename']}"
                    )
                self._verify_sha256(destination, asset["sha256"])
                last_error = None
                break
            except Exception as error:
                # 区分网络问题与本地 IO 问题 磁盘满/权限等本地错误切换下载源没有意义 直接上报真实原因
                is_network_error = isinstance(
                    error, (urllib.error.URLError, TimeoutError, ConnectionError)
                )
                is_source_error = isinstance(error, DetectionModuleError)
                if not is_network_error and not is_source_error:
                    destination.unlink(missing_ok=True)
                    raise DetectionModuleError(
                        f"本地写入失败 {asset['filename']}: {error}"
                    ) from error
                last_error = error
                destination.unlink(missing_ok=True)
                if source_index < len(sources) - 1:
                    self._emit_progress(
                        progress_callback,
                        completed_size / max(total_size, 1) * 88,
                        "fallback",
                        f"{source_name}不可用，正在切换下载源",
                    )
        if last_error:
            raise DetectionModuleError(f"所有下载源均不可用: {asset['filename']}") from last_error
        if asset["size"] and destination.stat().st_size != asset["size"]:
            destination.unlink(missing_ok=True)
            raise DetectionModuleError(f"下载文件大小异常: {asset['filename']}")

    def _download_from_source(
        self,
        asset,
        source_url,
        source_name,
        destination,
        completed_size,
        total_size,
        progress_callback,
    ):
        existing_size = destination.stat().st_size if destination.exists() else 0
        headers = {"User-Agent": "MangaReader-DetectionModule/1"}
        if existing_size:
            headers["Range"] = f"bytes={existing_size}-"

        request = urllib.request.Request(source_url, headers=headers)
        with urllib.request.urlopen(request, timeout=60) as response:
            if not response.geturl().startswith("https://"):
                raise DetectionModuleError("检测模块下载地址必须使用 HTTPS")
            is_partial = getattr(response, "status", None) == 206
            if existing_size and not is_partial:
                existing_size = 0
            mode = "ab" if is_partial else "wb"
            downloaded = existing_size
            with open(destination, mode) as output:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    self._emit_download_progress(
                        progress_callback,
                        completed_size + downloaded,
                        total_size,
                        f"{asset['name']}（{source_name}）",
                    )

    def _assemble_module(self, staging_path, assets):
        source_extract = staging_path / ".source"
        self._safe_extract(assets["source"], source_extract)
        source_roots = [path for path in source_extract.iterdir() if path.is_dir()]
        if len(source_roots) != 1:
            raise DetectionModuleError("CTD 官方源码包结构无效")
        source_root = source_roots[0]

        upstream_root = staging_path / "upstream"
        upstream_root.mkdir()
        for name in ("basemodel.py", "models", "utils"):
            source = source_root / name
            destination = upstream_root / name
            if source.is_dir():
                shutil.copytree(source, destination)
            elif source.is_file():
                shutil.copy2(source, destination)
            else:
                raise DetectionModuleError(f"CTD 官方源码缺少 {name}")

        base_model_path = upstream_root / "basemodel.py"
        base_model_text = base_model_path.read_text(encoding="utf-8")
        base_model_text = base_model_text.replace(
            "from utils.general import CUDA, DEVICE\n", ""
        )
        base_model_text = base_model_text.replace("from torchsummary import summary\n", "")
        base_model_path.write_text(base_model_text, encoding="utf-8")

        yolov5_utils_path = upstream_root / "utils" / "yolov5_utils.py"
        yolov5_utils_text = yolov5_utils_path.read_text(encoding="utf-8")
        yolov5_utils_text = yolov5_utils_text.replace(
            "import pkg_resources as pkg\n",
            "from packaging.version import parse as parse_version\n",
        )
        yolov5_utils_text = yolov5_utils_text.replace(
            "pkg.parse_version(x)", "parse_version(x)"
        )
        yolov5_utils_path.write_text(yolov5_utils_text, encoding="utf-8")

        shutil.copy2(source_root / "LICENSE", staging_path / "LICENSE")
        shutil.copy2(assets["model"], staging_path / "comictextdetector.pt")
        vendor_root = staging_path / "vendor"
        self._safe_extract(assets["wheel"], vendor_root)
        self._safe_extract(assets["torchvision-wheel"], vendor_root)
        shutil.rmtree(source_extract)

        manifest = {
            "id": MODULE_ID,
            "name": "漫画文字检测模块",
            "version": MODULE_VERSION,
            "apiVersion": SUPPORTED_API_VERSION,
            "adapter": "builtin-ctd-bbox-v1",
            "model": "comictextdetector.pt",
            "pythonPaths": ["upstream", "vendor"],
            "dllPaths": ["vendor", "vendor/cv2", "vendor/torchvision"],
            "device": "cpu",
            "sources": [
                {
                    "id": asset["id"],
                    "url": asset["url"],
                    "sha256": asset["sha256"],
                }
                for asset in OFFICIAL_ASSETS
            ],
        }
        (staging_path / "plugin.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def _validate_structure(self, module_path):
        manifest_path = module_path / "plugin.json"
        if not manifest_path.is_file():
            raise DetectionModuleError("检测模块缺少 plugin.json")
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise DetectionModuleError("检测模块清单无效") from error

        if manifest.get("id") != MODULE_ID:
            raise DetectionModuleError("检测模块 ID 不匹配")
        if manifest.get("version") != MODULE_VERSION:
            raise DetectionModuleError("检测模块版本不兼容")
        if manifest.get("apiVersion") != SUPPORTED_API_VERSION:
            raise DetectionModuleError("检测模块 API 版本不兼容")
        if manifest.get("adapter") != "builtin-ctd-bbox-v1":
            raise DetectionModuleError("检测模块适配器不兼容")

        self._resolve_member(module_path, manifest.get("model", ""))
        for field in ("pythonPaths", "dllPaths"):
            paths = manifest.get(field, [])
            if not isinstance(paths, list):
                raise DetectionModuleError(f"检测模块 {field} 无效")
            for relative_path in paths:
                self._resolve_directory(module_path, relative_path)
        if not (module_path / "LICENSE").is_file():
            raise DetectionModuleError("检测模块缺少 LICENSE")
        return manifest

    def _write_integrity_manifest(self, module_path):
        files = {}
        for file_path in sorted(path for path in module_path.rglob("*") if path.is_file()):
            relative_path = file_path.relative_to(module_path).as_posix()
            files[relative_path] = {
                "size": file_path.stat().st_size,
            }
        (module_path / "integrity.json").write_text(
            json.dumps({"version": 1, "files": files}, indent=2), encoding="utf-8"
        )

    def _safe_extract(self, archive_path, destination):
        destination.mkdir(parents=True, exist_ok=True)
        destination = destination.resolve()
        with zipfile.ZipFile(archive_path) as archive:
            for member in archive.infolist():
                member_path = Path(member.filename)
                if member_path.is_absolute() or ".." in member_path.parts:
                    raise DetectionModuleError("下载文件包含不安全路径")
                mode = member.external_attr >> 16
                if stat.S_ISLNK(mode):
                    raise DetectionModuleError("下载文件不允许包含符号链接")
                target = (destination / member_path).resolve()
                if destination != target and destination not in target.parents:
                    raise DetectionModuleError("下载文件解压路径越界")
            archive.extractall(destination)

    def _resolve_member(self, module_path, relative_path):
        if not isinstance(relative_path, str) or not relative_path:
            raise DetectionModuleError("检测模块文件路径无效")
        module_path = Path(module_path).resolve()
        member_path = (module_path / relative_path).resolve()
        if module_path not in member_path.parents or not member_path.is_file():
            raise DetectionModuleError(f"检测模块文件无效: {relative_path}")
        return member_path

    def _resolve_directory(self, module_path, relative_path):
        if not isinstance(relative_path, str) or not relative_path:
            raise DetectionModuleError("检测模块依赖目录无效")
        module_path = Path(module_path).resolve()
        directory_path = (module_path / relative_path).resolve()
        if module_path not in directory_path.parents or not directory_path.is_dir():
            raise DetectionModuleError(f"检测模块依赖目录无效: {relative_path}")
        return directory_path

    @classmethod
    def _verify_sha256(cls, file_path, expected_hash):
        if not re.fullmatch(r"[0-9a-f]{64}", str(expected_hash)):
            raise DetectionModuleError("检测模块 SHA-256 配置无效")
        if cls._calculate_sha256(file_path) != expected_hash:
            raise DetectionModuleError(f"下载文件校验失败: {Path(file_path).name}")

    @staticmethod
    def _calculate_sha256(file_path):
        digest = hashlib.sha256()
        with open(file_path, "rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _replace_path(source, destination):
        for attempt in range(8):
            try:
                os.replace(source, destination)
                return
            except PermissionError:
                if attempt == 7:
                    break
                time.sleep(0.25)

        source = Path(source)
        destination = Path(destination)
        if source.is_dir() and not destination.exists():
            shutil.copytree(source, destination)
            shutil.rmtree(source, ignore_errors=True)
            return
        raise PermissionError(f"无法替换检测模块目录: {source}")

    @classmethod
    def _emit_download_progress(
        cls, callback, downloaded_size, total_size, asset_name
    ):
        percent = min(88, downloaded_size / max(total_size, 1) * 88)
        cls._emit_progress(callback, percent, "downloading", f"正在下载 {asset_name}")

    @staticmethod
    def _emit_progress(callback, percent, stage, message):
        if callback:
            callback(
                {"percent": round(percent, 1), "stage": stage, "message": message}
            )
