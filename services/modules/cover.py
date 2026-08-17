# services/modules/cover.py
# 封面提取 从文件夹或 zip 中取自然排序最靠前的图片 压缩后返回 Base64
import base64
import io
import os
import re
import zipfile

from PIL import Image

from .utils import log_message


def atoi(text):
    return int(text) if text.isdigit() else text


def natural_keys(text):
    """
    alist.sort(key=natural_keys) sorts in human order
    http://nedbatchelder.com/blog/200712/human_sorting.html
    """
    return [atoi(c) for c in re.split(r"(\d+)", text.lower())]


def resize_image(img_data, max_height=300):
    try:
        image = Image.open(io.BytesIO(img_data))

        # Convert to RGB (in case of RGBA or CMYK) to save as JPEG
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")

        # Calculate new size
        width, height = image.size
        if height > max_height:
            ratio = max_height / height
            new_width = int(width * ratio)
            new_height = max_height
            image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)

        # Save to buffer
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=85)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")
    except Exception as e:
        log_message(f"Error resizing image: {e}")
        return None


def extract_cover_image(path):
    """
    Extracts the first image from a folder or ZIP file and returns it as a Base64 string.
    Uses natural sorting to ensure '1.jpg' comes before '10.jpg'.
    """
    allowed_exts = (".jpg", ".jpeg", ".png", ".webp", ".bmp")

    try:
        if os.path.isdir(path):
            files = [f for f in os.listdir(path) if not f.startswith(".")]
            # Use natural sort
            try:
                files.sort(key=natural_keys)
            except Exception as sort_err:
                log_message(f"Natural sort failed, using default sort: {sort_err}")
                files.sort()

            # Log first few files to debug sort order
            log_message(f"Cover candidates for {path}: {files[:3]}")

            for f in files:
                if f.lower().endswith(allowed_exts):
                    full_path = os.path.join(path, f)
                    try:
                        with open(full_path, "rb") as image_file:
                            return resize_image(image_file.read())
                    except Exception as img_err:
                        log_message(f"Failed to read image {f}: {img_err}")
                        continue

        elif zipfile.is_zipfile(path):
            with zipfile.ZipFile(path, "r") as zip_ref:
                file_list = zip_ref.namelist()
                file_list.sort(key=natural_keys)

                for file_name in file_list:
                    # Ignore directories in zip
                    if file_name.endswith("/"):
                        continue
                    if file_name.lower().endswith(allowed_exts):
                        try:
                            with zip_ref.open(file_name) as file:
                                return resize_image(file.read())
                        except Exception as img_err:
                            log_message(
                                f"Failed to read zip entry {file_name}: {img_err}"
                            )
                            continue

    except Exception as e:
        log_message(f"Failed to extract cover from {path}: {str(e)}")
        return None
    return None
