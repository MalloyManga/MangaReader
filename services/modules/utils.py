# services/modules/utils.py
import sys
import json
import os
import contextlib
import tqdm


def log_message(message):
    """输出日志到 stderr (Electron console 会显示)"""
    print(f"[Backend Service] {message}", file=sys.stderr, flush=True)


def send_response(response):
    """发送 JSON 响应到 stdout (Electron 通过 stdio 接收)"""
    try:
        # ensure_ascii=True 是最安全的做法，它会将非 ASCII 字符转义为 \uXXXX
        # Electron 的 JSON.parse 可以完美解析这些转义字符，还原为正确文字
        # 这样可以彻底避免 Python 和 Node 之间的编码不一致导致的乱码
        print(json.dumps(response, ensure_ascii=True), flush=True)
    except Exception as e:
        # 如果连报错都发不出去，那就只能写 stderr 了
        print(
            f"[Backend Service] [CRITICAL] Failed to send response: {e}",
            file=sys.stderr,
            flush=True,
        )


# --- TQDM Patching for Electron Progress Bar ---

_original_init = tqdm.tqdm.__init__
_original_update = tqdm.tqdm.update

# Global config for the current patch session
_tqdm_config = {
    "type": "progress",
    "msg_key": "message",
    "msg_value": "Loading...",
    "extra_fields": {},
}


def _patched_init(self, *args, **kwargs):
    # 1. 强制开启进度条
    kwargs["disable"] = False
    # 2. 将原始的视觉进度条重定向到空设备 (devnull)
    # 这样控制台就不会出现 ████▌ 这种字符，避免干扰 JSON 解析
    kwargs["file"] = open(os.devnull, "w")
    _original_init(self, *args, **kwargs)
    self.last_percent = -1


def _patched_update(self, n=1):
    # 调用原始 update 更新内部计数器
    _original_update(self, n)

    # 计算百分比并输出 JSON
    if self.total and self.total > 0:
        percent = (self.n / self.total) * 100

        # 过滤频率：每 0.5% 发送一次
        if int(percent * 2) > getattr(self, "last_percent", -1):
            self.last_percent = int(percent * 2)

            msg = {
                "type": _tqdm_config["type"],
                "percent": round(percent, 1),
                _tqdm_config["msg_key"]: self.desc or _tqdm_config["msg_value"],
            }
            msg.update(_tqdm_config.get("extra_fields", {}))
            # 显式写入 stdout 并 flush，确保 Electron 能立即收到
            sys.stdout.write(json.dumps(msg) + "\n")
            sys.stdout.flush()


@contextlib.contextmanager
def patch_tqdm(
    msg_type="progress",
    msg_key="message",
    default_msg="Loading...",
    extra_fields=None,
):
    """
    上下文管理器：在代码块执行期间，替换 tqdm 的行为以输出 JSON 格式进度
    """
    global _tqdm_config
    _tqdm_config["type"] = msg_type
    _tqdm_config["msg_key"] = msg_key
    _tqdm_config["msg_value"] = default_msg
    _tqdm_config["extra_fields"] = extra_fields or {}

    tqdm.tqdm.__init__ = _patched_init
    tqdm.tqdm.update = _patched_update
    try:
        yield
    finally:
        # 还原方法，避免影响其他模块
        tqdm.tqdm.__init__ = _original_init
        tqdm.tqdm.update = _original_update
        _tqdm_config["extra_fields"] = {}
