import json
import os
import shutil
import tempfile
import urllib.parse
import urllib.request
import zipfile
from html.parser import HTMLParser

from .utils import log_message, send_response


class _SimpleIndexParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        for key, value in attrs:
            if key == "href" and value:
                self.links.append(value)


class SudachiDictionaryManager:
    VERSION = "20251022"
    WHEEL_NAME = f"sudachidict_core-{VERSION}-py3-none-any.whl"
    WHEEL_MEMBER = "sudachidict_core/resources/system.dic"
    MIN_DICTIONARY_SIZE = 100 * 1024 * 1024
    SIMPLE_INDEXES = [
        "https://pypi.tuna.tsinghua.edu.cn/simple/",
        "https://mirrors.aliyun.com/pypi/simple/",
        "https://pypi.mirrors.ustc.edu.cn/simple/",
        "https://repo.huaweicloud.com/repository/pypi/simple/",
        "https://mirrors.cloud.tencent.com/pypi/simple/",
        "https://pypi.org/simple/",
    ]

    def __init__(self, dictionary_dir):
        self.dictionary_dir = dictionary_dir
        self.dictionary_path = os.path.join(dictionary_dir, "system.dic")
        self.manifest_path = os.path.join(dictionary_dir, "manifest.json")

    def check_exists(self):
        if not os.path.exists(self.dictionary_path):
            return False
        try:
            return os.path.getsize(self.dictionary_path) >= self.MIN_DICTIONARY_SIZE
        except OSError:
            return False

    def delete(self):
        if os.path.exists(self.dictionary_dir):
            shutil.rmtree(self.dictionary_dir)
            return True
        return False

    def download(self):
        os.makedirs(self.dictionary_dir, exist_ok=True)
        wheel_url = self._find_wheel_url()
        log_message(f"[INFO] Downloading Sudachi dictionary from: {wheel_url}")

        with tempfile.TemporaryDirectory() as tmp_dir:
            wheel_path = os.path.join(tmp_dir, self.WHEEL_NAME)
            self._download_file(wheel_url, wheel_path)
            self._extract_dictionary(wheel_path)

        if not self.check_exists():
            raise Exception("DICTIONARY_INSTALL_FAILED")

        self._write_manifest(wheel_url)
        send_response(
            {
                "type": "dictionary_download_progress",
                "percent": 100,
                "filename": self.WHEEL_NAME,
            }
        )
        return True

    def _find_wheel_url(self):
        last_error = None
        for base_url in self.SIMPLE_INDEXES:
            index_url = urllib.parse.urljoin(base_url, "sudachidict-core/")
            try:
                log_message(f"[INFO] Checking Sudachi dictionary index: {index_url}")
                request = urllib.request.Request(
                    index_url,
                    headers={"User-Agent": "MangaReader/1.3 SudachiDictionaryDownloader"},
                )
                with urllib.request.urlopen(request, timeout=20) as response:
                    html = response.read().decode("utf-8", "replace")

                parser = _SimpleIndexParser()
                parser.feed(html)
                for href in parser.links:
                    link = urllib.parse.urljoin(index_url, href)
                    filename = os.path.basename(
                        urllib.parse.unquote(urllib.parse.urlparse(link).path)
                    )
                    if filename.lower() == self.WHEEL_NAME.lower():
                        return link
            except Exception as exc:
                last_error = exc
                log_message(f"[WARN] Sudachi dictionary index failed: {exc}")

        raise Exception(f"DICTIONARY_DOWNLOAD_SOURCE_UNAVAILABLE: {last_error}")

    def _download_file(self, url, target_path):
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "MangaReader/1.3 SudachiDictionaryDownloader"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            total = int(response.headers.get("Content-Length") or 0)
            downloaded = 0
            last_percent = -1

            with open(target_path, "wb") as output:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)

                    if total > 0:
                        percent = round(downloaded / total * 100, 1)
                        if int(percent * 2) > last_percent:
                            last_percent = int(percent * 2)
                            send_response(
                                {
                                    "type": "dictionary_download_progress",
                                    "percent": min(percent, 99.0),
                                    "filename": self.WHEEL_NAME,
                                }
                            )

    def _extract_dictionary(self, wheel_path):
        tmp_dictionary_path = self.dictionary_path + ".tmp"
        if os.path.exists(tmp_dictionary_path):
            os.remove(tmp_dictionary_path)

        with zipfile.ZipFile(wheel_path) as wheel:
            with wheel.open(self.WHEEL_MEMBER) as source, open(
                tmp_dictionary_path, "wb"
            ) as target:
                shutil.copyfileobj(source, target)

        os.replace(tmp_dictionary_path, self.dictionary_path)

    def _write_manifest(self, source_url):
        manifest = {
            "name": "SudachiDict-core",
            "version": self.VERSION,
            "source": source_url,
            "file": "system.dic",
        }
        with open(self.manifest_path, "w", encoding="utf-8") as file:
            json.dump(manifest, file, ensure_ascii=False, indent=2)
