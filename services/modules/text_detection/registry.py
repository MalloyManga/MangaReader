import base64
import os
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

from .ctd_adapter import CtdDetectorAdapter
from .manager import DetectionModuleError


class TextDetectorRegistry:
    def __init__(self, manager):
        self.manager = manager
        self.detector = None
        self.loaded_version = ""
        self.import_paths = []
        self.dll_directories = []
        self.loaded_module_names = set()

    def detect_base64(self, image_base64):
        installed = self.manager.get_installed_module()
        if not installed:
            raise DetectionModuleError("DETECTION_MODULE_NOT_INSTALLED")
        if self.detector is None:
            self.manager.verify_integrity(installed["path"])
        self._ensure_loaded(installed)

        encoded = image_base64.split(",", 1)[-1]
        image = Image.open(BytesIO(base64.b64decode(encoded))).convert("RGB")
        raw_regions = self.detector.detect(image)
        return self._normalize_regions(raw_regions, image.width, image.height)

    def load(self):
        installed = self.manager.get_installed_module()
        if not installed:
            raise DetectionModuleError("DETECTION_MODULE_NOT_INSTALLED")
        self.manager.verify_integrity(installed["path"])
        self._ensure_loaded(installed)
        return installed["manifest"]["version"]

    def unload(self):
        try:
            if self.detector:
                self.detector.unload()
        finally:
            self.detector = None
            self.loaded_version = ""
            for module_name in self.loaded_module_names:
                sys.modules.pop(module_name, None)
            self.loaded_module_names = set()
            for import_path in self.import_paths:
                if import_path in sys.path:
                    sys.path.remove(import_path)
            self.import_paths = []
            for directory in self.dll_directories:
                directory.close()
            self.dll_directories = []

    def _ensure_loaded(self, installed):
        version = installed["manifest"]["version"]
        if self.detector is not None and self.loaded_version == version:
            return
        self.unload()

        module_path = installed["path"]
        manifest = installed["manifest"]
        if manifest.get("adapter") != "builtin-ctd-bbox-v1":
            raise DetectionModuleError("检测模块适配器不兼容")

        self.import_paths = [
            str(module_path / relative_path)
            for relative_path in manifest.get("pythonPaths", [])
        ]
        for import_path in reversed(self.import_paths):
            sys.path.insert(0, import_path)

        if os.name == "nt" and hasattr(os, "add_dll_directory"):
            self.dll_directories = [
                os.add_dll_directory(str(module_path / relative_path))
                for relative_path in manifest.get("dllPaths", [])
            ]

        detector = CtdDetectorAdapter()
        try:
            detector.load(module_path, device="cpu")
        except Exception:
            self._capture_loaded_modules()
            self.unload()
            raise

        self.detector = detector
        self.loaded_version = version
        self._capture_loaded_modules()

    def _capture_loaded_modules(self):
        roots = [Path(import_path).resolve() for import_path in self.import_paths]
        for module_name, module in list(sys.modules.items()):
            module_file = getattr(module, "__file__", None)
            if not module_file:
                continue
            try:
                module_path = Path(module_file).resolve()
            except OSError:
                continue
            if any(root == module_path or root in module_path.parents for root in roots):
                self.loaded_module_names.add(module_name)

    @staticmethod
    def _normalize_regions(raw_regions, image_width, image_height):
        normalized = []
        for raw_region in raw_regions or []:
            rect = raw_region.get("rect", raw_region)
            x = max(0.0, float(rect.get("x", 0)))
            y = max(0.0, float(rect.get("y", 0)))
            width = min(float(rect.get("width", 0)), image_width - x)
            height = min(float(rect.get("height", 0)), image_height - y)
            if width <= 0 or height <= 0:
                continue
            direction = raw_region.get("direction", "unknown")
            if direction not in ("horizontal", "vertical", "unknown"):
                direction = "unknown"
            normalized.append(
                {
                    "x": round(x, 2),
                    "y": round(y, 2),
                    "width": round(width, 2),
                    "height": round(height, 2),
                    "confidence": float(raw_region.get("confidence", 0)),
                    "direction": direction,
                }
            )
        return sorted(normalized, key=lambda region: (-region["x"], region["y"]))
