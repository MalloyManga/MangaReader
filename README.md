<div align="center">
  <img src="public/MangaReader_Header.png" alt="MangaReader Banner" width="100%">
</div>

# 📚 MangaReader - 日漫生肉阅读助手

<p align="center">
专为日语学习者打造的本地化 OCR 工具，助你轻松啃下日文生肉漫画。
<br>
<br>
<a href="#-功能特性">功能特性</a> •
<a href="#-下载与安装">下载安装</a> •
<a href="#-使用指南">使用指南</a> •
<a href="#-开发相关">开发相关</a>
</p>

---

## ⚠️ 重要声明 / Important Disclaimer

**本项目仅供学习交流使用，严禁用于任何商业用途。**

- 本项目中集成的 **SakuraLLM** 模型及其衍生模型遵循 **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)** 协议。
- 本项目**代码**遵循 GPL-3.0 协议开源。但在加载 SakuraLLM 模型进行翻译时，由于该模型遵循 CC BY-NC-SA 4.0 协议，组合后的整体软件**仅限非商业用途（Non-Commercial）**。如果您替换为其他兼容商业许可的模型，则不受此限制。
- 开发者不对使用本项目造成的任何版权问题或法律后果负责。如果您喜欢相关的漫画作品，请支持正版。

---

## ✨ 功能特性

- **📸 离线 OCR 识别**：基于 AI 模型，无需联网即可精准识别竖排日文漫画
- **✂️ 全局截图**：支持类似 QQ/微信 的截图方式，不仅限于漫画文件，可截取屏幕任意区域
- **🔍 智能分词**：自动将句子拆解为单词，标注假名读音 (Furigana)
- **🌐 多源翻译**：
  - **离线翻译**：支持加载本地翻译模型（需下载）

## 📥 下载与安装

前往 Releases 页面 下载最新版本的安装包

- **Windows**: 下载 `.exe` 文件安装
- **Mac/Linux**: (暂不支持)

## 📖 使用指南

### 1. 🟢 核心功能 (OCR)

_首次打开软件时程序会自动检查本地环境并下载_

- 如缺少模型，将自动连接 HuggingFace(镜像站) 下载到特定的项目文件夹（约 400MB），**请保持网络畅通**。
- 下载完成后，OCR 功能将**永久支持离线使用**，无需再次联网。
- 如需翻译服务，请在设置页面中进行配置

### 2. 📦 手动导入模型

若由于部分问题导致无法自动下载，可以手动配置：

1. 手动下载模型：
   - [manga-ocr](https://huggingface.co/kha-white/manga-ocr-base/tree/main) [manga-ocr(镜像)](https://hf-mirror.com/kha-white/manga-ocr-base/tree/main)
   - [SakuraLLM](https://huggingface.co/shing3232/Sakura-1.5B-Qwen2.5-v1.0-GGUF-IMX/tree/main) [SakuraLLM(镜像)](https://hf-mirror.com/shing3232/Sakura-1.5B-Qwen2.5-v1.0-GGUF-IMX/tree/main)
2. 打开软件设置(**ocr模型下载失败请直接打开模型文件夹**) -> 点击 **「📂 打开模型文件夹」**。
3. 进入 **对应的** 文件夹，将需要的文件文件解压至此。
4. 重启软件即可。

### 3. ⚙️ 翻译与其他扩展

可以在设置中配置附加功能：

- **分词**：默认开启，辅助划分日语单词边界。
- **翻译**：**默认不包含**，如有需要请在设置中进行配置。
- **OCR快捷键**：自定义OCR快捷键。

---

## 🧑‍💻 开发相关

如果你想参与贡献，请参考以下信息(待完善)

### 🛠 技术栈

| 模块                  | 技术              |
| --------------------- | ----------------- |
| **Core**              | Electron + Nuxt 4 |
| **UI**                | Tailwind CSS      |
| **OCR Service**       | Python + PyTorch  |
| **OCR Model**         | Manga-OCR         |
| **Translation Model** | SakuraLLM         |
| **Tokenization**      | SudachiPy         |

### 📂 项目结构

```text
MangaReader/
├── app/                # Nuxt 4 前端 (Vue 组件与页面)
│   ├── components/     # UI 组件
│   ├── composables/    # 组合式函数 (状态管理)
│   └── pages/          # 路由页面
├── electron/           # Electron 主进程
│   ├── main.cjs        # 应用入口
│   └── backend-service.cjs # Python 进程桥接
├── services/           # Python 后端 (OCR & NLP 核心)
│   ├── modules/        # 功能模块 (OCR, Tokenizer, Translator)
│   └── backend_service.py # 后端服务入口
└── public/             # 静态资源
```

### ⚡ 本地开发

- Node.js 18+
- Python 3.8+

## ⚖️ 许可与致谢 / License & Acknowledgements

本项目代码采用 **GPL-3.0** 协议开源。
The source code of this project is licensed under the **GPL-3.0** license.

### 核心组件与模型致谢

本项目站在巨人的肩膀上，特别感谢以下优秀的开源项目：

| 组件 / 模型   | 协议 (License)            | 说明                | 链接                                                     |
| ------------- | ------------------------- | ------------------- | -------------------------------------------------------- |
| **Manga-OCR** | Apache-2.0                | 离线 OCR 核心       | [GitHub](https://github.com/kha-white/manga-ocr)         |
| **SakuraLLM** | GPL-3.0 / CC BY-NC-SA 4.0 | 离线轻小说/漫画翻译 | [GitHub](https://github.com/SakuraLLM/SakuraLLM)         |
| **SudachiPy** | Apache-2.0                | 日语分词引擎        | [GitHub](https://github.com/WorksApplications/SudachiPy) |

