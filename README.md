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

**本项目主要用于学习交流。是否可用于其他场景，取决于所选模型、漫画素材及相关依赖各自的许可。**

- 本项目中集成的 **SakuraLLM** 模型及其衍生模型遵循 **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)** 协议。
- 本项目**代码**遵循 GPL-3.0 协议开源。但在加载 SakuraLLM 模型进行翻译时，由于该模型遵循 CC BY-NC-SA 4.0 协议，组合后的整体软件**仅限非商业用途（Non-Commercial）**。如果您替换为其他兼容商业许可的模型，则不受此限制。
- OPUS-MT、Qwen3 等可选模型遵循各自发布页标注的许可，下载和使用前请自行确认适用范围。
- 开发者不对使用本项目造成的任何版权问题或法律后果负责。如果您喜欢相关的漫画作品，请支持正版。

---

## ✨ 功能特性

- **📸 离线 OCR 识别**：基于 AI 模型，无需联网即可精准识别竖排日文漫画
- **🧭 自动文字检测（开发中）**：按需下载检测模块，自动定位整页文字区域并复用现有 OCR、翻译与气泡校对流程
- **✂️ 全局截图**：支持类似 QQ/微信 的截图方式，不仅限于漫画文件，可截取屏幕任意区域
- **🔍 智能分词**：自动将句子拆解为单词，标注假名读音 (Furigana)
- **🌐 多源翻译**：
  - **OPUS-MT ja-zh**：约 300 MB，速度快、体积小
  - **Sakura-1.5B-Qwen2.5**：约 1.2 GB，面向漫画、轻小说与 Galgame
  - **Qwen3-4B-Instruct-2507**：约 2.5 GB，通用翻译质量更高、资源占用更大

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
   - [OPUS-MT ja-zh](https://huggingface.co/shun89/opus-mt-ja-zh) [OPUS-MT ja-zh(镜像)](https://hf-mirror.com/shun89/opus-mt-ja-zh)
   - [Qwen3-4B GGUF](https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF) [Qwen3-4B GGUF(镜像)](https://hf-mirror.com/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF)
2. 打开软件设置(**ocr模型下载失败请直接打开模型文件夹**) -> 点击 **「📂 打开模型文件夹」**。
3. 进入 **对应的** 文件夹，将需要的文件文件解压至此。
4. 重启软件即可。

### 3. ⚙️ 翻译与其他扩展

可以在设置中配置附加功能：

- **分词**：默认开启，辅助划分日语单词边界。
- **翻译**：**默认不包含**，可按设备性能选择 OPUS-MT、Sakura 或 Qwen3。
- **自动检测**：模块默认不包含，功能完成后可在“设置 > 自动检测”中按需下载安装。
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
| **Translation Model** | OPUS-MT / SakuraLLM / Qwen3 GGUF |
| **Text Detection**    | CTD (可选模块，开发中) |
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
│   ├── modules/        # 功能模块 (OCR, Tokenizer, Translator, Detector)
│   └── backend_service.py # 后端服务入口
└── public/             # 静态资源
```

### ⚡ 本地开发

- Node.js 18+
- Python 3.8+

### Backlog

- **浏览器扩展**：复用现有框选、OCR Block 与翻译校对流程，支持当前网页截图、用户框选区域识别，以及后续的整页自动检测。

## ⚖️ 许可与致谢 / License & Acknowledgements

本项目代码采用 **GPL-3.0** 协议开源。
The source code of this project is licensed under the **GPL-3.0** license.

### 核心组件与模型致谢

本项目站在巨人的肩膀上，特别感谢以下优秀的开源项目：

| 组件 / 模型   | 协议 (License)            | 说明                      | 链接                                                     |
| ------------- | ------------------------- | ------------------------- | -------------------------------------------------------- |
| **Manga-OCR** | Apache-2.0                | 离线 OCR 核心             | [GitHub](https://github.com/kha-white/manga-ocr)         |
| **SakuraLLM** | GPL-3.0 / CC BY-NC-SA 4.0 | 漫画、轻小说离线翻译      | [GitHub](https://github.com/SakuraLLM/SakuraLLM)         |
| **OPUS-MT**   | 以模型发布页为准          | 轻量日译中离线翻译        | [Hugging Face](https://huggingface.co/shun89/opus-mt-ja-zh) |
| **Qwen3**     | Apache-2.0                | 通用 GGUF 离线翻译        | [Hugging Face](https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF) |
| **CTD**       | GPL-3.0                   | 漫画文字区域检测（开发中）| [GitHub](https://github.com/dmMaze/comic-text-detector)  |
| **llama.cpp** | MIT                       | GGUF 模型推理运行时        | [GitHub](https://github.com/ggml-org/llama.cpp)          |
| **SudachiPy** | Apache-2.0                | 日语分词引擎              | [GitHub](https://github.com/WorksApplications/SudachiPy) |

