import gc
import sys
import types
from pathlib import Path

from packaging.version import parse as parse_version


def _ensure_pkg_resources_compatibility():
    if "pkg_resources" in sys.modules:
        return
    compatibility_module = types.ModuleType("pkg_resources")
    compatibility_module.parse_version = parse_version
    sys.modules["pkg_resources"] = compatibility_module


class CtdDetectorAdapter:
    def __init__(self):
        self.device = "cpu"
        self.input_size = (1024, 1024)
        self.confidence_threshold = 0.4
        self.nms_threshold = 0.35
        self.network = None

    def load(self, module_path, device="cpu"):
        _ensure_pkg_resources_compatibility()
        import torch
        from basemodel import TextDetBase

        self.device = device
        model_path = str(Path(module_path) / "comictextdetector.pt")
        self.network = TextDetBase(model_path, device=device, act="leaky")
        self.network.eval()

    def detect(self, image):
        if self.network is None:
            raise RuntimeError("CTD detector is not loaded")

        import cv2
        import numpy as np
        import torch
        from utils.imgproc_utils import letterbox
        from utils.yolov5_utils import non_max_suppression

        image_bgr = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)
        image_input, _ratio, (dw, dh) = letterbox(
            image_bgr, new_shape=self.input_size, auto=False, stride=64
        )
        tensor = image_input.transpose((2, 0, 1))[::-1]
        tensor = np.ascontiguousarray([tensor]).astype(np.float32) / 255.0
        tensor = torch.from_numpy(tensor).to(self.device)

        with torch.no_grad():
            blocks, _mask, _lines = self.network(tensor)
            detections = non_max_suppression(
                blocks, self.confidence_threshold, self.nms_threshold
            )[0]

        if not len(detections):
            return []
        detections = detections.detach().cpu().numpy()
        image_height, image_width = image_bgr.shape[:2]
        resize_ratio = (
            image_width / (self.input_size[0] - dw),
            image_height / (self.input_size[1] - dh),
        )
        detections[:, [0, 2]] *= resize_ratio[0]
        detections[:, [1, 3]] *= resize_ratio[1]

        regions = []
        for x1, y1, x2, y2, confidence, _class_id in detections:
            width = max(0.0, float(x2 - x1))
            height = max(0.0, float(y2 - y1))
            if width <= 0 or height <= 0:
                continue
            regions.append(
                {
                    "x": float(x1),
                    "y": float(y1),
                    "width": width,
                    "height": height,
                    "confidence": float(confidence),
                    "direction": "vertical" if height >= width else "horizontal",
                }
            )
        return regions

    def unload(self):
        self.network = None
        gc.collect()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass
