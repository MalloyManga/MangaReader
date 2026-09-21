<div align="center">
  <img src="public/MangaReader_Header.png" alt="MangaReader Banner" width="100%">
</div>

# 📚 MangaReader - 日漫生肉阅读助手 / Read raw Japanese manga, offline

<p align="center">
🇨🇳 <a href="README.md">简体中文</a> · 🇬🇧 <a href="README.en.md">English</a>
</p>

<p align="center">
A local OCR and translation reader built for people learning Japanese — point it at a scan, and it reads the bubbles for you.
<br>
<br>
<a href="#-features">Features</a> •
<a href="#-privacy">Privacy</a> •
<a href="#-install">Install</a> •
<a href="#-models">Models</a> •
<a href="#-development">Development</a>
</p>

---

## ⚠️ Important Disclaimer

**This project is intended for study and personal use. Whether you may use it elsewhere depends on the licences of the models you load, the manga you feed it, and its dependencies.**

- The **SakuraLLM** models integrated here and their derivatives are released under **CC BY-NC-SA 4.0**. Because of that, the combined application is **non-commercial** as long as one of those models is in use. Swap in a commercially licensed model and this restriction no longer applies to you.
- OPUS-MT, Qwen3 and the other optional models follow the terms stated on their own release pages. Check them before downloading.
- The maintainers accept no liability for copyright or legal consequences of how you use this software. If you enjoy a series, please support the official release.

The application code itself is GPL-3.0 (see [LICENSE](LICENSE)).

---

## 🔒 Privacy

**OCR, text-region detection, tokenization and translation all run on your own machine.**

- MangaReader only touches the network when it downloads an OCR model, a translation model, the tokenization dictionary or the detection module. Those requests fetch files and nothing else.
- Scans, recognised text and translations stay on your device. They are **never uploaded to a cloud service or a third-party AI API**.
- There is no telemetry, no upload feature, and nothing in this project uses your manga images or text for AI training or dataset collection.

**In other words: reading a scan with MangaReader never ships the artist's work to somebody else's model.**

---

## ✨ Features

- **📸 Offline OCR** — AI-based recognition of vertical Japanese text, no connection required once installed.
- **🌐 Two output languages** — translate into **Chinese or English**, and switch the interface language between the same two. English output runs on OPUS-MT ja-en, entirely locally.
- **🧭 Automatic detection & translation** — install the text-detection module on demand, then process the current page or run the whole book in series. Detection, OCR and translation happen automatically, and every region stays editable: adjust, delete or draw your own boxes.
- **🔍 Tokenization** — breaks sentences into words and annotates each with its reading (furigana).
- **📦 Pluggable translation models** — pick by size and quality:

  | Model | Target | Size | Notes |
  | --- | --- | --- | --- |
  | **OPUS-MT ja-en** | English | ~307 MB | Small, fast, CPU-friendly |
  | **OPUS-MT ja-zh** | Chinese | ~300 MB | Small, fast, CPU-friendly |
  | **Sakura-1.5B-Qwen2.5** | Chinese | ~1.2 GB | Tuned for manga, light novels and galge |
  | **Qwen3-4B-Instruct-2507** | Chinese | ~2.5 GB | Higher general quality, heavier to run |

---

## 📥 Install

Grab the latest installer from the [Releases](https://github.com/MalloyManga/MangaReader/releases) page.

- **Windows**: download the `.exe` installer and run it.
- **macOS / Linux**: not packaged yet.

---

## 📦 Models

### 1. 🟢 Core OCR (automatic)

The first time you launch MangaReader it checks your environment and downloads the OCR model (~400 MB) from [huggingface.co](https://huggingface.co). Keep the connection up until it finishes. After that, OCR works fully offline forever.

### 2. 🌐 Translation (opt-in)

Translation is **not bundled**. Open **Settings → Translation**, pick a model that fits your hardware and download it there. The list shows only models for the output language you selected in **Settings → Language**.

### 3. 🧭 Text detection (opt-in)

Also optional, installed from **Settings → Detection** as a one-click download (~121 MB), and uninstallable the same way. It reuses the OCR and translation models you already have, so enable translation before running auto-detection.

### 4. 🔧 Manual import

If a download fails — network trouble, a proxy, a corporate firewall — you can place the files yourself. Open **Settings → Translation → 📂 Open model folder**; that takes you to the right directory (for a packaged Windows install it is `resources/backend/models` under the install location). Then drop the files into the matching subfolder:

| What | Where it goes | Source |
| --- | --- | --- |
| OCR model | `models/ocr` | [kha-white/manga-ocr-base](https://huggingface.co/kha-white/manga-ocr-base/tree/main) |
| OPUS-MT ja-en | `models/translation` | [Helsinki-NLP/opus-mt-ja-en](https://huggingface.co/Helsinki-NLP/opus-mt-ja-en/tree/main) |
| OPUS-MT ja-zh | `models/translation` | [shun89/opus-mt-ja-zh](https://huggingface.co/shun89/opus-mt-ja-zh/tree/main) |
| Sakura GGUF | `models/translation` | [shing3232/Sakura-1.5B-Qwen2.5-v1.0-GGUF-IMX](https://huggingface.co/shing3232/Sakura-1.5B-Qwen2.5-v1.0-GGUF-IMX/tree/main) |
| Qwen3 GGUF | `models/translation` | [bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF](https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/tree/main) |
| Tokenization dictionary | `models/dictionary/sudachi` | SudachiDict-core (installed from Settings, ~207 MB) |

Restart the app afterwards. The detection module is not part of this layout — it is managed as a plugin and only installs through **Settings → Detection**.

---

## ⚙️ Other settings

- **Tokenization** — on by default; marks Japanese word boundaries in recognition results.
- **Translation** — off by default until you choose a model.
- **Reading modes** — study mode (image left, text right), list mode, and an immersive mode that overlays translations on the page.
- **Global shortcuts** — bind OCR capture plus previous/next page.

---

## 🧑‍💻 Development

### Stack

| Layer | Technology |
| --- | --- |
| **Core** | Electron + Nuxt 4 |
| **UI** | Tailwind CSS |
| **OCR service** | Python + PyTorch |
| **OCR model** | Manga-OCR |
| **Translation models** | OPUS-MT / SakuraLLM / Qwen3 GGUF |
| **Text detection** | CTD (optional, installed on demand) |
| **Tokenization** | SudachiPy |

### Layout

```text
MangaReader/
├── app/                # Nuxt 4 renderer (Vue components and pages)
│   ├── components/     # UI components
│   ├── composables/    # Composables (state and logic)
│   └── pages/          # Routed pages
├── electron/           # Electron main process
│   ├── main.cjs        # Entry point (startup sequence, lifecycle)
│   ├── ipc/            # IPC domains (library/settings/system/files/backend-api/protocol)
│   ├── backend-service.cjs # Bridge to the Python process
│   └── preload.js      # Renderer API bridge
├── services/           # Python backend (OCR and NLP core)
│   ├── modules/        # Features (OCR / tokenization / translation / detection / session / dispatch / handlers)
│   └── backend_service.py # Backend entry point (argument parsing, message loop)
└── public/             # Static assets
```

### Prerequisites

- Node.js 20+ (required by dependencies such as electron-store)
- Python 3.10+ (the message router uses `match`/`case`)

```bash
npm install      # also runs nuxt prepare
npm run dev      # renderer on http://localhost:3000
npm start        # Electron with the dev renderer
npm run build:win # packaged Windows build
npm run check:i18n # locale key audit: duplicates, gaps, dead keys
```

### Backlog

- **Browser extension** — reuse the existing region-select, OCR block and proofreading flow to capture the current page, recognise a user-drawn region, and later detect a full page automatically.

### Where this is going

MangaReader wants to become a local-first manga reading, translation and language-processing platform that you assemble yourself. The core keeps to the bookshelf, reader, editor, export and plugin management; OCR, text detection, translation models, dictionaries and tokenization are being split out into plugins you install on demand. That way you pick the lightest or the most accurate model for the language pair, hardware and quality you care about, instead of downloading capabilities you never use. Plugins install, uninstall and update independently, so a better model adaptation means updating one plugin rather than reinstalling the app. Longer term, a stable versioned plugin interface should let the community add more manga languages, models and study features — with the same guarantee we started from: your scans and the text extracted from them stay on your machine.

---

## ⚖️ License & Acknowledgements

The source code of this project is licensed under the **GPL-3.0** license.

### Components and models

This project stands on the work of others:

| Component / Model | License | Role | Link |
| --- | --- | --- | --- |
| **Manga-OCR** | Apache-2.0 | Offline OCR core | [GitHub](https://github.com/kha-white/manga-ocr) |
| **SakuraLLM** | GPL-3.0 / CC BY-NC-SA 4.0 | Offline translation for manga, light novels, galge | [GitHub](https://github.com/SakuraLLM/SakuraLLM) |
| **OPUS-MT** | Per model page | Lightweight offline NMT (ja-zh, ja-en) | [ja-zh](https://huggingface.co/shun89/opus-mt-ja-zh) · [ja-en](https://huggingface.co/Helsinki-NLP/opus-mt-ja-en) |
| **Qwen3** | Apache-2.0 | General-purpose GGUF translation | [Hugging Face](https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF) |
| **CTD** | GPL-3.0 | Comic text-region detection | [GitHub](https://github.com/dmMaze/comic-text-detector) |
| **llama.cpp** | MIT | GGUF inference runtime | [GitHub](https://github.com/ggml-org/llama.cpp) |
| **SudachiPy** | Apache-2.0 | Japanese tokenization | [GitHub](https://github.com/WorksApplications/SudachiPy) |
