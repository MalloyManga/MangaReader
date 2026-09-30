# services/modules/tokenizer.py
import sys
from typing import Any, ClassVar

from .utils import log_message

_cached_sudachi: Any = None


def _load_sudachi(runtime_path: str | None) -> Any:
    """sudachipy 不在核心包内 从插件安装目录动态加载."""
    global _cached_sudachi
    if _cached_sudachi:
        return _cached_sudachi
    if runtime_path and runtime_path not in sys.path:
        sys.path.insert(0, runtime_path)
    from sudachipy import dictionary, SplitMode

    _cached_sudachi = (dictionary, SplitMode)
    return _cached_sudachi


class JapaneseTokenizer:
    # 静态配置: 词性映射
    POS_MAPPING: ClassVar[dict[str, str]] = {
        "名詞": "noun",
        "代名詞": "noun",
        "動詞": "verb",
        "形容詞": "adjective",
        "形状詞": "adjective",
        "副詞": "adverb",
        "助詞": "particle",
        "助動詞": "particle",
        "感動詞": "other",
        "接頭辞": "other",
        "接尾辞": "other",
        "記号": "other",
    }

    def __init__(self, dict_path: str | None = None, runtime_path: str | None = None) -> None:
        self.tokenizer: Any = None
        self.mode: Any = None
        self.init_error: str
        try:
            log_message("Initializing Sudachi Tokenizer...")
            dictionary, SplitMode = _load_sudachi(runtime_path)
            self.mode = SplitMode.C
            dict_arg = dict_path if dict_path else "core"
            self.tokenizer = dictionary.Dictionary(dict=dict_arg).create()
            log_message(" Tokenizer Initialized.")
        except Exception as e:
            log_message(f"[ERROR] Tokenizer Init Failed: {e}")
            self.tokenizer = None
            self.init_error = str(e)

    def _katakana_to_hiragana(self, text: str) -> str:
        """
        辅助函数: 将片假名转换为平假名
        利用 Unicode 偏移量: 片假名 = 平假名 + 0x60
        """
        result = []
        for char in text:
            code = ord(char)
            # 片假名 Unicode 范围 (0x30A1 - 0x30F6)
            if 0x30A1 <= code <= 0x30F6:
                result.append(chr(code - 0x60))
            else:
                result.append(char)
        return "".join(result)

    def tokenize(self, text: str) -> list[dict[str, Any]]:
        if not self.tokenizer:
            raise Exception("Tokenizer not ready")

        # 调试日志: 打印输入文本的 repr 查看是否有乱码
        log_message(f"Tokenizing text: {repr(text)}")

        # 预处理: 移除可能导致问题的特殊字符 (如 surrogates)
        # 仅保留基本多文种平面 (BMP) 和常见的扩展平面字符
        # 或者简单地忽略无法编码的字符
        try:
            text = text.encode("utf-8", "replace").decode("utf-8")
        except Exception:
            pass

        results = self.tokenizer.tokenize(text, self.mode)
        tokens = []

        for t in results:
            surface = t.surface()  # 原词 例如 "食べる" 或 "ながら"

            # 1. 获取读音 (Sudachi 默认返回片假名 如 "タベル" 或 "ナガラ")
            reading_katakana = t.reading_form()

            # 2. 转换为平假名 (如 "たべる" 或 "ながら")
            reading_hiragana = self._katakana_to_hiragana(reading_katakana)

            # 3. 智能判断是否需要返回读音
            # 如果原词和平假名读音一样 (例如 "ながら" == "ながら")  就设为 None
            # 或者原词就是片假名且读音也是片假名 (例如 "ラーメン")  也设为 None
            final_reading = None
            if surface != reading_hiragana and surface != reading_katakana:
                final_reading = reading_hiragana

            pos_list = t.part_of_speech()
            main_pos = pos_list[0]
            frontend_type = self.POS_MAPPING.get(main_pos, "other")

            tokens.append(
                {
                    "word": surface,
                    "reading": final_reading,  # 新增字段: 如果有值则显示 无值则不显示
                    "type": frontend_type,
                }
            )

        log_message(f"Tokenization complete. Found {len(tokens)} tokens.")
        return tokens
