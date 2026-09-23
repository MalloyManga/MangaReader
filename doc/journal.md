# 开发日志（Journal）

按时间倒序记录每次会话完成了什么（精确到时分）以及对应 commit。Bug 的详细分析见 [bugs-and-fixes.md](./bugs-and-fixes.md)。

---

## 2026-09-23（AI 结对：Qoder 主写）

### 00:29–02:15 — 插件化/共享运行时方向讨论，落地为剥离 unidic-lite（B-2026-013）

- **起因**：Malloy 提出把"模型适配代码 + 模型本身"做成下载单位，让安装包变小。**结论：这个方向在体积上榨不出收益，已当场推翻并记录**——三条实测依据：① 权重本来就不在安装包里（`forge.config.cjs` 忽略 `models/`，`electron-builder.json` 的 `files`/`extraResources` 均不含 `models`），OCR 424M、翻译模型 293M 早已是按需下载；② 适配代码是 KB 级（检测器 `plugin.json` 4K），真正的大头是权重与 Python 运行时；③ 共享 runtime **不会减少下载、只是避免重复**——torch 302M 只要用户装任何一个需要它的模型就得付，体感只是从安装期挪到使用期。插件化对 Malloy 的真实价值在"**能自由加新语言**"，不在体积。
- **顺带纠正两处误判**：`installed/ctd-detector/1.0.0/vendor/` 的 114M **不是第二份 torch**，而是 cv2 107M + torchvision 7.1M，且 torchvision 0.17.2 正是宿主 torch 2.2.2 的配套版本——检测器其实已经在共享宿主 torch，`manager.py + registry.py + installed/<id>/<version>` 这套形态是现成可用的（cv2 也因此早就不在核心包里）。
- **实际落地点**：安装包里最大的一块"没人需要的固定开销"是 `dist/backend/_internal/unidic_lite` **249M**。链路：`models/ocr/tokenizer_config.json` 声明 `word_tokenizer_type: mecab` → `manga_ocr/ocr.py:18` 硬编码 `AutoTokenizer.from_pretrained()` → `BertJapaneseTokenizer` 构造时即加载整个 MeCab 词典；而 `:49` 显示该 tokenizer 全程只用于 `decode()`，`:51` 的 `post_process` 第一行 `"".join(text.split())` 还会抹掉所有空白。
- **修法（两处）**：`services/modules/ocr_engine.py` 新增 `basic_word_tokenizer()` 上下文管理器，仅在构造 `MangaOcr` 期间给 `AutoTokenizer.from_pretrained` 注入 `word_tokenizer_type='basic'`，`finally` 还原；`build_backend.spec` 把 `fugashi`/`unidic_lite` 加入 `excludes`、删除两段 `collect_all`，并把 `filter_sudachidict_artifacts` 扩名为 `filter_dict_artifacts`（与 `cv2`/`torchvision` 的既有处理姿势一致）。
- **为什么是注入 kwarg 而不是改写 `tokenizer_config.json`**：中途我先实现了"下载后就地改写该 json"，随后发现生产环境模型目录是 `process.resourcesPath/backend/models`（`electron/main.cjs:60`，即安装目录内），写文件会带来 `PermissionError` 直接把 OCR 打死的新失败模式，且会篡改用户下载的模型文件。改为内存注入后无写盘：实测暂存目录的配置在冻结包跑完 OCR 后**仍是 mecab**。
- **验证（逐层，均有可复核输出）**：
  1. 屏蔽 `fugashi` 导入（注意：Python 3.12 已移除 `find_module`，须用 `find_spec`）后，原 mecab 配置构造即 `ImportError` —— 证明这 249M 今天确实是硬依赖，不能只删包；
  2. 两种 tokenizer 对 300 个 token id 的 `decode()` 结果完全一致；
  3. venv 走真实 `OCREngine`（屏蔽 unidic）与"确实使用 `MecabTokenizer` 的对照组"输出同 sha `ca11d242b0bae023`（72 字节）；
  4. **同基线对照构建**：`build_backend.spec` 原版产出 763M（其中 `unidic_lite` 249M），改后 513M，**净 -250M**，新包内确认无 `unidic_lite`/`fugashi`；
  5. **冻结 `backend.exe`**（英文分支基线）喂 mecab 配置：OCR 初始化成功、输出同 sha、模型文件未被改写。
  **Electron 实机完整 App（真图 + 真 UI）未跑**，仅验证到冻结后端进程这一层。
- **保留项（Malloy 拍板：以后必做，本轮不做）**：点词/Sudachi 分词确实小众，未来做成插件。**注意：我先前写"每次 OCR 都会 lazy 构造 `JapaneseTokenizer`"是错的，已在 10:08 更正**——`handle_recognize`（`handlers_ocr.py:10-12`）根本不碰分词器，构造只发生在 `handle_tokenize`（`:20-21`），且前端有 `v-if="settings.enableTokenization"` 门（`reader.vue:585`）。真实情况是：该功能**已按需、已被设置项门控**，只是 `useSettings.ts:17` 默认 `true`；`sudachidict_core` 也已按需下载，不占包体积；核心包里属于它的代码仅 `sudachipy` 3.5M。
- **提交**：`build_backend.spec` + `services/modules/ocr_engine.py` + 本文件与 `doc/bugs-and-fixes.md`（B-2026-013）。

### 00:30 前后 — 一次协作事故记录（分支基点搞错 + doc 短暂丢失，已无损恢复）

- **事故**：Malloy 说"当前分支已完成，新建分支来写"，但执行 `git checkout -b` 时 HEAD 实际停在 `main`（`74d15ab`，2026-08-20），于是新分支 `feat/shared-runtime-plugin-architecture` 被从**八月旧代码**切出，缺九月 ja→en 全部工作（`main` 与 `feat/japanese-to-english-adaptation` 相差 75 文件 / +2714 −561）。
- **连带现象**：`doc/journal.md`、`doc/bugs-and-fixes.md` 从工作树"消失"——`.gitignore` 现在是 `doc/*` 加这两份的白名单（`!doc/journal.md`、`!doc/bugs-and-fixes.md`，09-20 那次改的），所以它们在九月分支上**是被跟踪的**；而 `main`（`74d15ab`）上还没有这两条白名单，15:32 切到 `main` 时文件便随 checkout 离开了跟踪集、被 git 删掉。`git log --diff-filter=D` 查不到删除提交，因为这不是删除，只是随分支切换。
- **恢复**：从 `91aa397:doc/journal.md`、`f97b105:doc/bugs-and-fixes.md` 取回，`git hash-object` 与 `rev-parse` 比对确认与九月分支 blob **逐字节一致**；随后 `git checkout -B feat/shared-runtime-plugin-architecture feat/japanese-to-english-adaptation` 把分支挪回 `998f9f5`，改动以 `/tmp/unidic.patch`（4051B）保存后干净重放，git 顺带原位恢复了两份 doc。本轮所有验证已在**正确基线**上重跑（见上条 4、5）。
- **我自己的一步失误**：临时移开 doc 副本的命令末尾串了 `rm -rf "$T"`，在 checkout 失败的情况下仍执行，把副本删了；因事先校验过 blob 哈希，实际无损。**教训：清理动作不要和未验证的操作串在一条命令里。**
- **给未来的自己**：新建分支前先 `git log -1` 确认基点，不要假设"当前就停在你说的那条分支上"。

### 02:22–10:11 — 完整打包与体积实测（Malloy 批准）

- `npm run build:win` 已跑：`MangaReader Setup 1.5.2.exe` = **241.1 MiB**，对比上一个已发布构建 `1.5.1` 的 270.8 MiB，**净 -29.6 MiB**；同次构建的 `MangaReader-1.5.2-win.zip` 314.1 MiB vs `1.5.1` 358.1 MiB（-44.0 MiB，zip 压缩率低于 NSIS，两个口径差属正常）。
- **口径提醒**：`1.5.1` 是 7-30 从更早代码构建的，**不是同基线对照**，所以这 -29.6 MiB 里混着九月其他改动的加减；纯净的同基线对照是后端目录（763M → 513M，-250M，其中 unidic 249M）。
- 产物已落在 `dist_electron/`，Electron 实机由 Malloy 自测。为对比而挪出的旧构建 `dist/backend.bak-unidic`（763M）已删。

### 11:05–11:25 — 点词默认改为关闭（Malloy 批准）

- **改了什么**：`app/composables/useSettings.ts:17` 的 `enableTokenization` 由 `true` 改为 `false`。
- **为什么**：`TokenizedWords.vue:86` 的 watcher 带 `immediate: true`，而 `reader.vue:585` 用 `v-if="settings.enableTokenization"` 决定挂载——默认开着意味着**每个用户一进阅读器就立刻发一次 tokenize 请求**；词典没下时后端抛 `DICTIONARY_NOT_FOUND`，前端就在卡片里渲染琥珀色提示 `readerWorkflow.dictionaryRequired`＝"需要先在设置 > 翻译模型中下载日语分词词典。"（`app/locales/zh.json:64`，词典自报"约 207 MB"`general.dictionarySize`）。等于**纯阅读用户在默认状态被反复引导去下一个他完全用不到的小众功能的大词典**。想用的人在"设置 > 通用"那个既有 checkbox（`SettingsGeneral.vue:316`）开即可，开了仍走既有词典下载流程。零新代码，只是把开关拨到默认位置。
- **生效范围（重要，Malloy 需知）**：`useSettings.ts:100-103` 是 `Object.assign(settings.value, storedSettings)`，而 `:47-60` 的 watch 会把每个 key 全量写回 electron-store。**所以老用户 store 里已经存着 `enableTokenization: true`，本次改动不会翻转存量用户，只影响全新安装。** 若要让存量用户也默认关闭，需要一次性迁移（如 `settingsVersion` 字段）——但那之后也无法区分"用户主动开"与"默认被写入"，这是个未决的产品岔路，暂不动。
- **验证**：`npm run check:i18n` → `en keys 335 | zh keys 335` 对齐；输出的 5 条 hardcoded CJK 均在本次未触碰的文件里（`useModelStatus.ts` 的模型描述与 `reader.vue:21` 的演示串），属既有告警。改的是布尔字面量默认值，无新增文案、无 i18n key 变动。**Electron 实机未跑**（要看的效果是：新装或清 store 后，阅读器右侧不再出现分词卡片与"需要下载词典"提示；设置里勾选后卡片恢复且能触发词典下载）。

### 11:25 关于"词典已按需下载 ≠ 插件化"的澄清（Malloy 拍板要做拆分）

- Malloy 问"词典不是已经做了下载选项吗？"——**对，两件事不是一回事**：已做的是**数据层按需下载**（`sudachidict_core` 不进包，spec 里被排除，设置里点下载）；未做的是**代码层可独立装卸与独立更新**。分词器代码 `services/modules/tokenizer.py` 与 `sudachipy` 运行时（实测 `dist/backend/_internal/sudachipy` 3.5M）现在**焊在核心包里**，改一行也要重发整个 App。
- Malloy 结论："那我们就拆分成插件呗"。**下一步的增量是代码可拆 + 独立版本，不是下载选项**（体积收益只有 3.5M，先前已量化）。可复用的模板是检测器那套已验证形态：`manager.py + registry.py + plugin.json + integrity.json + installed/<id>/<version>` 与 `sys.path`/DLL 目录注入。



### 11:30–12:05 — Sudachi 分词插件化：后端层完成（Malloy 拍板：下载源走 PyPI，不自建托管）

- **岔路决定**：插件代码文件从 **PyPI 官方 wheel** 拉，不搭自己的发布资产。Malloy 的理由是要长期维护就得背负担；而且检测器插件已经是这个做法（`text_detection/manager.py:49,61` 从 `files.pythonhosted.org` 拉 opencv/torchvision 固定 wheel，`mirrors.aliyun.com` 兜底）。
- **协议核查**（Malloy 主动问到再分发是否允许）：SudachiPy 0.6.10 与 SudachiDict-core 均为 **Apache-2.0**（读本地 `*.dist-info/METADATA` 的 `License:` 字段），允许原样再分发，条件是带上 LICENSE 与版权声明；我们不改其代码，只解包。另外确认 **sudachipy 没有任何运行时依赖**（METADATA 里只有 test extras），所以插件包就是"一个 wheel 解出 `sudachipy/` 目录"。
- **先做 spike 证明前提**：故意打一个不含 sudachipy 的冻结程序，让它从外部目录 import 并分词 → `frozen=True`、来源为外部 `__init__.py`、6 个 token 与 venv 基线逐字段一致。意义是：先证明"搬出去还能用"，再动手搬。
- **新增 `services/modules/tokenization/manager.py`**（`SudachiRuntimeManager`）：遍历 6 个 PyPI 索引找 `SudachiPy-0.6.10-cp312-cp312-win_amd64.whl` → 下载（带进度）→ **代码里钉死的 sha256 校验**（索引本身也给 `#sha256=`，但钉在代码里才不会被镜像或索引骗到）→ 只解 `sudachipy/` 前缀成员并防 zip slip → 写 `plugin.json` + `integrity.json`（逐文件 sha256）→ 装到 `<modules_root>/tokenization/installed/0.6.10/`。版本钉 0.6.10 与 venv 实测一致；wheel 文件名是大写 `SudachiPy-`（0.6.11 起才改小写），比较时两边都转小写所以不受影响。
- **`tokenizer.py` 去掉模块级 `from sudachipy import ...`**：那是关键坑——模块级 import 会让 PyInstaller 又把 sudachipy 收进包里，排除个寂寞。改成 `_load_sudachi(runtime_path)` 延迟加载并缓存。
- **踩到并修掉一个真 bug**：把**包目录本身**插进 `sys.path` 时，包里的 `sudachipy.cp312-win_amd64.pyd` 会被当作顶层模块 `sudachipy` import 到，反而盖掉真正的包，报 `cannot import name 'dictionary'`。必须插**上一层**（安装根目录），已固化成 `sys_path_entry` 属性并留注释。
- **未就绪拆成两种状态**：`handle_tokenize` 先查插件（`TOKENIZER_RUNTIME_NOT_INSTALLED`）再查词典（`DICTIONARY_NOT_FOUND`）。顺带修掉一个顺序 bug：`handle_download_dictionary` 原本下载完词典就立刻构造分词器，而现在词典可以先于插件下载，已改成只失效缓存、交给 tokenize 按需重建。
- 新命令：`check/download/delete_tokenization_runtime`（`dispatch.py` + `handlers_misc.py`）。
- 打包：`build_backend.spec` 把 `sudachipy` 加进 `excludes` 与 `filter_dict_artifacts`，删掉 `collect_all('sudachipy')`。
- **验证（全部打在冻结 `dist/backend/backend.exe` 上，`--modules-root` 指临时目录）**：① 包里没有 sudachipy 时启动正常、`ping` 通（OCR 主链路没被牵连）；② 未装插件时 tokenize 干净返回 `TOKENIZER_RUNTIME_NOT_INSTALLED`，进程不死；③ `download_tokenization_runtime` 从 PyPI 真实下载、sha256 校验通过、安装成功；④ `check` 返回 installed true；⑤ tokenize 得 `今日/は/いい/天気/です/ね` 含读音与词性，与改造前一致。
- 体积：后端目录 513M → **509M**（-4M，与 sudachipy 3.5M + 元数据一致），包内确认无 `sudachipy`。
- **本轮没做到的（选型带来的代价，必须记清）**：插件里只有第三方运行时，**我们自己的适配代码（`tokenizer.py` 的 POS 映射与读音处理）仍在核心包里**——因为选了"不自建文件托管"，我们自己的代码就没有可下载的来源。所以"适配代码可独立更新"这条本轮不成立。
- **下一步（未完成）**：Electron 侧（`electron/ipc/backend-api.cjs`、`backend-service.cjs`、preload）、设置页插件卡、前端区分两种未就绪提示 + i18n 文案、完整打包复测。

### 13:20–13:36 — 全量核查"文档 == 代码"，修 README 与分词默认值的矛盾

- **核查方式**：拿 journal 11:30 段的每条声明回代码点位比对。全部对得上：`tokenizer.py` 已是 `_load_sudachi()` 延迟加载（不再是模块级 import，否则 PyInstaller 又把它收进包）；`build_backend.spec:33,79` 确实在 excludes 里；`requirements.txt:3` 确实钉了 `manga-ocr==0.1.14`；`useSettings.ts:17` 的 `enableTokenization` 已是 `false`；`electron/` 与前端确实**还没有**分词插件那一层（与本文件第 68 行"下一步未完成"一致）。B 编号 001–013 连续；B-2026-003（vue-tsc 未装）、B-2026-004 遗留（`useModelStatus` fallback 只有 `['zh']`）经核实仍成立；`plugin-platform-vision.md:28/:51` 的旧论断仍在工作树里，属本文件第 72 行**已记录的推迟项**，不是漏记。
- **修掉的矛盾（README 说反话）**：`README.md:91` 原文「分词：默认开启」、`README.en.md:107` 原文 "on by default" —— 与 11:05 那次改默认值冲突（README 写于 02:30 之前）。两份都改成"默认关闭 + 在 设置 > 通用 开启 + 该页下载 SudachiDict-core 约 207 MB"。措辞依据：`SettingsGeneral.vue:333-364` 确实是词典卡所在页，`general.dictionarySize` 值即"约 207 MB"。
- **修掉的小瑕疵**：本文件第 29 行原先写"`.gitignore:41` 虽写着 `doc/`"，但 `.gitignore` 现状是 `doc/*` + 两份白名单（09-20 那次加的）。事故结论不变——`main`（`74d15ab`）上没有这两条白名单，所以切过去时文件离开跟踪集——但叙述里的文件状态已改写为准确版本。
- **发现但按 Malloy 指示未动**：
  1. `services/requirements.txt:4` 的 `sudachipy` **没有钉版本**，而 `tokenization/manager.py` 里 `VERSION = "0.6.10"` 写死；这正是第 74–76 行为 `manga-ocr` 论证过的同类漂移（本文件第 59 行自己提到"0.6.11 起 wheel 文件名改小写"）。**13:44 已收口（Malloy 追问后处理）**：`requirements.txt` 已钉 `sudachipy==0.6.10`，与 venv 实测的 `SudachiPy-0.6.10.dist-info` 一致（所以不需要重装依赖），并加注释指明它必须与 `manager.py` 的 `VERSION` 同步。
  2. `app/locales/zh.json` 的 `readerWorkflow.dictionaryRequired` 仍写"需要先在**设置 > 翻译模型**中下载日语分词词典"，而词典控制早已在「设置 > 通用」（`SettingsGeneral.vue`）。属 UI 文案与页面归属不一致，未在本次授权范围内，留作待确认。
- **改动范围**：`README.md`、`README.en.md` 与本文件。

### 截至 11:25 仍未了结

1. **架构讨论的结论尚未回写 `doc/plugin-platform-vision.md`。（10:55 Malloy 定：推迟，等真正启动第三种语言时再处理——插件化的收益本来就是"加语言不发版"，不是省体积。）** 该文档 `:28` 把"模型适配代码 + 模型文件"视为一个插件下载单位，`:51` 说"不应为其复制一整套运行代码"，但按本轮实测需要修正为三层：核心 / **共享 runtime** / 插件（适配声明 + 权重）。同时要记下两条结论与两个未解难点：共享 runtime **只避免重复、不减少首次下载量**（torch 302M 用到就得付）；未解难点是 runtime 变体（CPU/CUDA 自动选择与回退）与插件对 runtime 的兼容区间表达。方向本身仍成立，但价值在"能自由加新语言"，不在安装包体积。
2. **英文分支仍未审查、未合并**，因此本分支的两个提交（`d0f75b6`、`b33a714`）是悬在未合并基点上的；合并顺序由 Malloy 定。
3. **`basic_word_tokenizer()` 与 `manga_ocr/ocr.py:18` 的调用点耦合 —— 已按 Malloy 定的"低成本方案"收口（10:55）**：把 `services/requirements.txt:3` 的 `manga-ocr` 钉成 `==0.1.14`（与当前 venv 实测版本一致）。
   - **为什么这条是必要的而不是"等上游哪天改"**：`requirements.txt` 原本没有版本约束，所以**重建 venv（换机器、重装依赖）本身就会拿到当时的最新版**，不需要任何人主动升级。钉住之后，升级才变成一次有意识的动作。
   - **依赖来源已核实**（`manga_ocr-0.1.14.dist-info/METADATA` 的 `Requires-Dist`）：`manga-ocr` 自己就把 `fugashi`、`unidic_lite`、`torch>=1.0`、`transformers>=4.25.0` 声明为依赖 —— 这正是当年 spec 里那句"BertJapaneseTokenizer 必须"的出处。`requirements.txt` 也确实没有单独声明 torch/transformers，它们全靠这一层传递。
   - **钉版本没有解决的部分**：`torch>=1.0` 与 `transformers>=4.25.0` 是开区间，钉住 `manga-ocr` 只固定了它的传递集成员，不固定这两个的实际解析结果。
   - **配套纪律**：升 `manga-ocr` 时必须重跑一次 OCR 冒烟（判据：后端日志出现 `MangaOCR Initialized Successfully`；若变成 `No module named 'fugashi'` 即说明上游不再经 `AutoTokenizer.from_pretrained` 构造分词器，`basic_word_tokenizer()` 失效）。失败模式是响亮的，不会静默出错字。
   - **不做的事**：不 vendor 那 70 行（`basic_word_tokenizer()` 已经是"二次封装"，没有动第三方源码；venv 被 gitignore，改源码会被下次重装抹掉）；不为本条新建 pytest 基建（`doc/unit-testing-strategy.md` 明确测试落地时机是"第一个新功能通道加入时"，届时可把 OCR 冒烟列为首批用例）。
   - **顺带发现的更大可复现性缺口（未处理，留给 Malloy 审查时定）**：`requirements.txt` 里**没有显式声明 `torch` / `transformers` / `sentencepiece` / `tokenizers`**，它们靠 `manga-ocr` 的开区间传递依赖解析进来，打包用的 torch 版本会在不同机器上漂移——影响面比 manga_ocr 那 70 行大得多。
4. **点词/Sudachi 分词做成插件 —— 进行中：后端层已完成并冻结验证（见 11:30–12:05 段），剩 Electron IPC、设置页插件卡、两种未就绪状态的前端提示与 i18n、完整打包复测**（Malloy 11:2x 拍板"那就拆分成插件"）。默认值已改为 `false`（见 11:05 段）。体积收益实测 4M（513M→509M），真正收益仍是"加语言不发版"。
   - **时间口径注意**：Malloy 说"现在已经是第二天了"，但本机 `date` 实测仍是 **2026-09-23 11:17**（会话从 00:29 起，Malloy 中途睡了一觉，10:12 醒）。原定"09-24 处理"的这件事按对话语义已提前开始，journal 里的日期以本机时间为准。

## 2026-09-21（AI 结对：Qoder 主写）

### 13:50–14:30 — 修复英文嵌字逐字母拆分（B-2026-012）

- **问题**：Malloy 报告英文翻译已跑通，但嵌字把英文译文一个字母一个字母拆开竖排；且英文常比日文明显更长。根因：嵌字管线（`BubbleLayer.vue` 叠层 + `useTranslatedImageExport.ts` 导出）只有日语竖排一条路，导出侧还 `Array.from()` 逐码点画进固定竖排单元格，全程无语言分支。
- **修法**：新增 `app/composables/textLayout.ts`（`usesLatinScript` 按译文文字系统判横/竖排；`wrapLines` 按词 greedy 换行 + 长词硬切的纯函数）；导出侧新增 `drawHorizontalText`（canvas `measureText` 真实量宽、字号收缩至装下、clip 在气泡内）；叠层侧按 `isLatinBlock` 切 `bubble-horizontal`（横排按词换行），CJK 保留竖排，拉丁字号系数 0.60→0.72，另加 `v-fit-text` 指令按实测溢出缩字号（≥6px）兜"译文过长"。
- **验证**：Node 断言测 `wrapLines`/`usesLatinScript`（esbuild 转译真实模块）全过；`@vue/compiler-sfc` 编译 `BubbleLayer.vue` 过；真实浏览器（dev :3002）里 import 真实模块——canvas 画出按词换行的英文（含 24 字母长词）、挂载真实 `BubbleLayer` 渲染英/日/超长混合气泡，逐 span 几何比对四块均无溢出，截图确认，控制台无新增错误。**Electron 实机真图真译文未跑**。
- **提交**：`fd12c2a` `fix: place English translations as word-wrapped horizontal text in bubbles`（仅 3 个前端文件；Malloy 已实机验证通过。doc/ 与 services/ 里其他会话的未提交内容按指示未随本次提交）。

### 14:12 前后 — 语言设置页 UI 重设计（Malloy：两个原生 radio 太丑）

- **做法**：`SettingsLanguage.vue` 两个语言改为**卡片式按钮**，风格对齐 `SettingsGeneral` 阅读模式卡片——globe 图标容器 + 语言自称；选中态蓝色卡片 + 图标蓝底 + 右上角蓝色勾选徽章，未选中灰底 hover 反馈；底部提示改为 `IconTip` 蓝色信息框（对齐 `SettingsTranslate` 风格）；去掉根部 `p-6`（SettingsModal 已有 `p-8`）。
- **细节**：保留 `role="radiogroup"/"radio"` + `aria-checked` 无障碍语义（沿用下载源分段控件的模式）；新增 `settings.languageDesc` 副标题 key（en/zh 各 335 键）；切语言后 toast 复用已有 `messages.languageChanged*`。
- **验证**：`npm run check:i18n` 通过（335/335、未使用 0）；真实浏览器（Qoder Browser Connector）实测深/浅两主题——选中态随点击迁移、整界面即时切换语言、控制台无新增错误（仅剩浏览器环境固有的 Electron API 缺失告警）。
- **提交**：`02d006b` `feat: redesign language settings tab with card-style selectors`。
- **注意**：工作树里仍留有上一会话未提交的 B-2026-010/011 Python 修复与 doc 更新（Electron 实机复验仍未跑），本次未动、未提交；本条目也随其留在工作树，待一起处理。

### 14:35–14:55 — 下载链路修复：实机验证闭环 + journal 结构修复（B-2026-010/011 关闭）

- Malloy 实机复测确认：英文 opus-mt-ja-en 选官方源**完整下载成功**、416 不再复现，B-2026-010/011 两条关闭。
- 修 journal 结构：我上一轮插入 22:15/23:15 条目时，把「### 截至 18:56 仍未了结」从其所属的 17:50–18:56 段落中截断、错排到了 09-20 段尾。已移回原位（"环境坑一枚"之后、22:15 条目之前）。
- 提交范围：仅 B-2026-010/011 的 Python 修复（`services/modules/translator/*`、`session.py`）与对应文档条目。Malloy 的嵌字改动（B-2026-012：`BubbleLayer.vue`、`useTranslatedImageExport.ts`、`textLayout.ts`）与其 journal/bug 条目**保持未提交**。
- **commit**：`1eb462f` `fix: honor download source in translation model downloads`。

### 16:05–16:20 — 全仓中文注释去标点清理（Malloy 指令）

- **规则**（Malloy 确认）：`，。、` → 空格；`：`→`: `、`；`→`; `、`（）`→` ( ) `、`“”` 与 `「」`→ `"`；范围=代码注释（`//`、`/* */`、`<!-- -->`、`#`）+ Python docstring，字符串与文档不动。
- **做法**：临时脚本两件套——JS/TS/Vue 走字符串/注释状态机只重写注释区间；Python 用 `tokenize` 精确取 COMMENT 与语句首位置 STRING（docstring）token 原位替换。共改 **33 文件 / 107 处注释段**。
- **验证**：复扫注释含中文标点 0 处；`python -m compileall services` 通过；改动的 8 个 ts/cjs 经 esbuild 解析通过、12 个 .vue 经 `@vue/compiler-sfc` 解析通过；`npm run check:i18n` 与改动前基线输出一致（exit 0）。验收示例 `SettingsLanguage.vue:10` 逐字符匹配目标格式。临时脚本已删除，未入库。

## 2026-09-20（AI 结对：Qoder 主写，Malloy 审阅）

- **13:20 前后** — 对齐分支上下文：确认 `feat/japanese-to-english-adaptation` 上 26 个未提交文件为 i18n 扫尾批次；盘点出约 20 个组件/composables 仍残留硬编码文案。
- **~14:15** — 完成 i18n 全覆盖改造：
  - 剩余组件全部接入 `t()`：TitleBar、ConfirmModal、GlobalLoader、TokenizedWords、Translation、SettingsAbout、SettingsLanguage（消除三元写法）、LanguageSelectionModal、FileUpload 空状态、ImageThumbnail、ResizableSplitPane 等；
  - composables：useAutoTranslateProcessing / Session / BookSource / DetectionModuleStatus / DictionaryStatus / ModelStatus / TranslatedImageExport；
  - en/zh 各 **374 个 key 对齐**，329 个被引用 key 全部可解析；
  - 图片选择器 `img[alt^="当前图片"]` 改为语言无关的 `img[data-current-image]`；
  - 冒烟验证：`/`、`/library`、`/reader`、`/auto-translate` 均 200。
- **14:21** — 提交 `f4083fb` `feat: complete i18n coverage for remaining components and composables`（36 文件，+1147/−386）。
- **14:21–14:35** — Malloy 上手运行后发现 `ConfirmModal.vue` 编译报错（`defineProps` 解构默认值引用 `t()`），修复为"props 可选 + 模板 `??` 回退"，dev server 重新验证通过。详见 Bug 文档 B-2026-002。
- **14:43** — 提交 `947920f` `fix: resolve ConfirmModal compile error from t() in defineProps defaults`。
- **14:43 前后** — 新建两份维护文档：`doc/journal.md`（本文件）与 `doc/bugs-and-fixes.md`；.gitignore 由 `doc/` 改为 `doc/*` + 两份文档白名单，使文档随仓库走、其他个人笔记仍忽略。
- **14:52** — Malloy 指出 `en.json`/`zh.json` 中 `autoTranslateWorkflow.pageProgress` 重复。升级校验脚本按原文行扫描（此前 `Object.entries` 拍平会吞掉重复 key，属漏检），删除重复项并记录为 B-2026-005。复跑：en/zh 各 374 键、无重复、无缺失；四路由 200。
- **14:53** — 提交 `3011367` `fix: remove duplicate pageProgress key from locale files` 与 `237784d` `docs: add development journal and bug log, whitelist them in gitignore`。
- **15:00–15:52** — Malloy 报运行期错误 `ReferenceError: useI18n is not defined`，并质疑"44 个未使用 key = 脚手架残留"的判断。**两项均确认我错了**：
  - 根因：项目未装 `@nuxtjs/i18n`，`useI18n` 不在 Nuxt 自动引入范围（`.nuxt/imports.d.ts` 只有自家 `useSettings`/`useToast`）；仓库 31 个文件都是显式 import，唯 5 个 composable 漏 import——`useFileProcessor`/`useDetectionModuleStatus`/`useTranslatedImageExport` 是早前 i18n commit 遗留，`useDictionaryStatus`/`useModelStatus` 是我引入。`app.vue` 启动即调 `useModelStatus`，故 app initialization 抛错。记录为 B-2026-006。
  - 修法：5 个文件补显式 import；把 i18n 实例抽到 `app/locales/instance.ts`，令 setup 之外执行的 `createBatchState()` 改用 `i18n.global.t`（依赖注入上下文之外不可用）。记录为 B-2026-007。
  - "未使用 key"结论修正：我的扫描器漏判三元/变量 key（`messages.languageChanged*` 实为已用），且 `library.deleteBook` 等并非残留，而是**图标按钮从未接线**（书架删除按钮、窗口最小化/最大化/关闭按钮均无 `title`/`aria-label`）。校验脚本落库为 `scripts/check-i18n.cjs` + `npm run check:i18n`。
- **15:52** — 浏览器实测（in-app browser，视口 0×0 故部分点击不可驱动）：应用启动无报错；语言切到 English 后 `⚙️ Settings`/`Library`/`Batch Translate` 生效；General 面板全英文；词典条目渲染为 `SudachiDict-core / Approx. 207 MB`（证明 `useDictionaryStatus` 的 `t()` 已修复）。

### 当时的待决事项 → 已由 Malloy 决策
1. 9 个冗余别名 key（同句文案已有在用 key，如 `settings.title` vs `common.settings`）与 34 个从未接线的孤儿 key（`settings.token`/`removeToken`、`library.editBook` 等）：**全部删除**。
2. `library.deleteBook` 与窗口最小化/最大化/关闭三键：**补上**（兼无障碍修复）。
3. `useFileProcessor.ts:5` 模块顶层调用 `useToast()`：暂不动（`useToast` 不依赖 inject，当前安全）。

- **16:05–16:28** — 执行上述决策：
  - 接线：`MinimizeButton`/`MaximizeButton`/`CloseButton` 加 `aria-label` + `title`（`MaximizeButton` 按 `isMaximized` 在 `common.maximize` / `common.restore` 间切换）；`index.vue` 书架删除按钮接 `library.deleteBook`；新增 `common.minimize/maximize/restore` 双语 key。顺带修正 `MinimizeButton.vue` 顶部注释误写为 `CloseButton.vue`。
  - 清理：删除 42 个从未使用的 key，locale 总量 377 → **335**；`npm run check:i18n` 结果：无重复、en/zh 零差集、引用零缺失、**未使用数 0**。
  - 浏览器实测：控制台无 error；重载后窗口三键读出 `最小化/最大化/关闭`，切英文后读出 `Minimize/Maximize/Close`；图标按钮已无可访问名缺失者。
  - 注意：`library.deleteBook` 的 tooltip 只做了静态验证——浏览器环境下 `window.electronAPI` 不可用、无法往书架添加书籍，故未能亲眼看到该按钮渲染。
  - 提交：`11f48dc` `refactor: prune 42 unused locale keys and add window control labels`、`6b49ee8` `fix: add missing accessible labels to icon-only window and delete buttons`。

### 17:50–18:56 语言与模型目录联动（Malloy 提 5 点，问答对齐后实施）

Malloy 的 5 点：①首进书架要弹语言选择、且要写进 settings json；②"返回书架"仍是中文（bug）；③语言设置缺图标；④语言设置里每个语言显示了两遍名字；⑤翻译模型应只显示目标语言对应的模型，模型信息也要是该语言。

决策（AskUserQuestion）：弹窗 ✕ = **不写入、下次仍弹**；语言行**只用自称**（中文 / English）；图标**AI 自绘 globe**；切语言后已选模型**自动切到该语言的默认**。

- **18:05** — ⑤的根因不在 Python，而在 **Electron IPC 三跳把 `targetLanguage` 丢了**：`useModelStatus` 传了参、`interface.d.ts` 类型也声明了参数，但 `preload.js:64` 无参、`backend-api.cjs:102` 不接、`backend-service.cjs:327` 不发 → 后端恒按 `"zh"` 过滤。另发现 `default_model_id` 取的是**全局**体积最小（`opus-mt-ja-zh`），即便语言传对了英文默认仍指向中文模型 → 新增 `get_default_translator_id_for_language()`。记录为 B-2026-008。
- **18:20** — 前端 `modelsLoaded` 改为按语言缓存（`modelsLoadedLang`）；拉取后把目录裁剪为"仅当前语言"；已选模型不属该语言时自动切默认；`TranslationModel` 增 `target_languages`，fallback 目录补该字段。
- **18:30** — 落实①②③④：弹窗 ✕ 改 emit `dismiss`（不写 `targetLanguage`，下次仍弹）；`reader.vue:540` 的硬编码 `📚 返回书架` 改 `t('common.backToLibrary')`——**这是上轮扫描的漏检**，原因是我的 `grep -vF 't('` 会把含 `emit(` / `get(` 的行整行排除；`SettingsLanguage` 主/副标题重复改为单行自称，删除 `settings.languageNameZh/En`；新建 `Icon/Language.vue`（globe）接入侧栏并删掉 `menuItems` 中从未使用的 `icon` 死字段。
- **18:45** — `check-i18n.cjs` 增**硬编码 CJK 检测**（剥离 HTML/JS 注释与 `console.*` 后扫描），把这类漏检变成机器可查。复跑：en/zh 各 334 键、无重复、零差集、零缺失、未使用 0。剩余 2 类告警为可接受项：`useModelStatus` 的 fallback 目录文案属后端所有；`reader.vue:21` 是日语示例内容而非 UI 文案。
- **18:56** — 提交 `de2fade`（IPC + 后端按语言取默认）、`cd50b62`（语言驱动模型目录）、`fb83702`（globe 图标）、`aca6de2`（补漏改文案 + 校验加固）。
- **验证到什么程度**：Python 侧直接调注册表确认 `zh → 3 个模型 / en → 仅 opus-mt-ja-en（英文描述）`，默认值分别为 `opus-mt-ja-zh` / `opus-mt-ja-en`；浏览器确认侧栏 5 个图标各不相同（语言项已是 globe）、`SettingsLanguage` 编译产物只剩 `languageZh/languageEn` 两个 key 且接上 `loadTranslationModels`、弹窗编译产物含 `dismiss`、`reader.vue` 编译产物为 `common.backToLibrary`；控制台无 error。**未能验证**：整条 Electron IPC 与模型列表实际渲染（需 `npm start` 起 Electron + Python 后端，纯浏览器无 `window.electronAPI`）；Settings 各 tab 切换在 in-app browser 里点不动——`Transition mode="out-in"` 在 0×0 视口内过渡永不结束，语言弹窗关闭后 DOM 残留也是同一原因，非应用缺陷。
- **环境坑一枚**：改完 `app/plugins/i18n.ts` 后 dev server 出现 `503` 与 `Failed to load module script ... MIME "text/html"`，清 `node_modules/.vite` + 重启后消失，属 Vite 脏模块图，非代码问题。

### 截至 18:56 仍未了结
1. **Electron 全链路未实机跑过**（模型列表按语言过滤、下载、切换后默认模型），需 `npm start` 验一次。
2. `nuxt typecheck` 仍不可用：vue-tsc 未进 devDependencies（B-2026-003）。
3. `useFileProcessor.ts:5` 在模块顶层调用 `useToast()`，仅因 `useToast` 不依赖 inject 才安全（隐患）。
4. `useModelStatus` 的 fallback 目录仍只有中文模型与中文文案，后端不可用且界面为英文时列表会空。
5. `library.deleteBook` tooltip 与语言弹窗残留 DOM 属未亲眼所见/环境所致，需在 Electron 里确认一次。

### 22:15–22:51 修复：下载源设置对翻译模型不生效（B-2026-010）

Malloy 报告：已明确选"官方"下载源，日志仍先走 `hf-mirror.com`（5 次重试 SSL EOF 失败后才回退官方），中/英 target 均如此。

- **排查**：链路上半段完好——Settings 保存 → `store.downloadSource` → `backend.restart(source)` → 子进程带 `--download-source` 与 `HF_ENDPOINT` → `Session.download_source`；OCR 与文字检测都消费了它。**断点在 Python 翻译引擎**：`Session.get_or_create_translator()` 没把 `download_source` 传给 `get_translator_engine()`，opus ja-zh / opus ja-en / qwen3 三引擎硬编码 `download_bases=[镜像, 官方]`，且用 `urllib` 直连，`HF_ENDPOINT` 对它们无效。
- **修法**：`translator/base.py` 新增 `ordered_download_bases()`（所选源优先、另一源兜底，与 OCR 约定一致）；三个引擎构造函数接收 `download_source`；工厂与 Session 逐层透传。sakura 走 `hf_hub_download` 本就吃 `HF_ENDPOINT`，未改。
- **验证**：venv 直调工厂与 `Session`，`official` → 三引擎均 `[huggingface.co, hf-mirror.com]`；`mirror`/缺省 → 镜像在前。两源小文件请求当前均 200（日志里的 SSL EOF 属 hf-mirror 瞬时网络问题）。改动文件 `py_compile` 通过。**Electron 实机下载未复验**（见下）。

### 截至 22:51 仍未了结
1. 本轮修复需在 Electron 里实机复验一次：选"官方"后下载 opus-mt-ja-en，首条日志应打 `https://huggingface.co`。
2. （沿袭 19:05 交接）`npm start` 验语言→模型链路 / vue-tsc（B-2026-003）/ `useModelStatus` fallback 目录 / `useFileProcessor.ts:5` 顶层 `useToast()`。

### 23:15–23:34 二次修复：英文 OPUS 下载 416 死循环（B-2026-011）

Malloy 复测：中文已好，英文仍失败，但日志首条已变为 `failed from https://huggingface.co (attempt 1/5): HTTP Error 416` ——B-2026-010 的源顺序修复对英文其实已生效，他"没真的用新源"的猜测不成立；真正卡点是两个新问题：

- **期望大小错**：HF API 实测后修正 `opus_english_engine.py` 五个值（`config.json` 1411→1381、`pytorch_model.bin` 317638400→303294189 等），并删除英文仓库不存在的 `special_tokens_map.json`；中文引擎四个偏离值一并对齐（中文当时未触发只因 expected 恰好都 ≤ 实际）。qwen3 实测一致，未改。
- **416 无自愈**：`download_model` 判 incomplete 后带非法 `Range` 重试 → 416 ×（5 次 × 2 源）死循环。三个引擎的 `_download_file` 现捕获 416：删 `.tmp`、去 Range 全量重下。
- **验证**：直调 `_download_file` 三例通过——现场 1381B 残留 tmp 被自动转正；越界 tmp 触发 416 自愈；干净下载 1381B。`py_compile` 通过。磁盘上那个 `config.json.tmp` 未手删（新逻辑自行处理）。**Electron 实机 300MB 完整下载仍未跑**。

### 截至 23:34 仍未了结
1. ~~Electron 实机复验英文 opus-mt-ja-en 完整下载~~ — **已于 2026-09-21 下午由 Malloy 实机验证闭环**：选官方源完整下载成功，416 不再复现（B-2026-010/011 关闭）。
2. （沿袭上文）语言→模型链路实机验证、vue-tsc、`useModelStatus` fallback 目录、`useFileProcessor.ts:5`。

---

## 会话交接（2026-09-20 19:05，feat/japanese-to-english-adaptation）

工作树干净，全部改动已提交；下一个会话可直接从"未验证清单"开干。

### 分支完成度

| 块 | 状态 | 证据 |
|---|---|---|
| 后端日→英能力（opus-mt-ja-en、engine、registry） | 完成 | `4c0ef51`、`78f7234`；本轮直调 `list_translator_models_by_language` |
| 前端 i18n 全覆盖（无硬编码文案） | 完成 | `npm run check:i18n`：334/334 键、零差集、零缺失、未使用 0、硬编码 CJK 仅剩 2 处可接受项 |
| 语言驱动模型目录（IPC 参数 + 按语言默认模型） | **代码完成，未实机验证** | Python 直调：`zh→3 模型/default=opus-mt-ja-zh`，`en→仅 opus-mt-ja-en/default=opus-mt-ja-en` |
| 图标按钮可访问名 | 完成 | 浏览器读出中/英 `最小化/最大化/关闭`；`library.deleteBook` 仅静态验证 |

本轮 commit：`de2fade` `cd50b62` `fb83702` `aca6de2` `dfc0ab8`（19:00）。

### 下个会话的切入点（按优先级）

1. **跑 `npm start` 验语言→模型链路**：英文界面 Settings > 翻译应只出现 `OPUS-MT ja-en`（英文描述）；在语言设置里切 zh↔en，卡片集合与"当前使用"应随之变化。注意后端首启可能自动下载模型（数百 MB），跑之前先确认是否接受。
2. **装 vue-tsc 进 devDependencies**，让 `nuxt typecheck` 可用（B-2026-003 至今未解，意味着这轮所有 TS 改动都没过类型检查）。
3. **`useModelStatus` fallback 目录**：后端不可用时的兜底仍是中文-only，英文界面会空列表（B-2026-004 遗留）。
4. **`useFileProcessor.ts:5` 模块顶层 `useToast()`**：目前是侥幸安全。

### 本会话踩过的三个坑（给后续会话避雷）

- `useI18n` **不在** Nuxt 自动引入范围（无 `@nuxtjs/i18n`），判据是 `.nuxt/imports.d.ts`；仓库惯例是显式 import（B-2026-006）。
- `ssr: false` 下 curl 拿 200 不代表运行时没崩，必须读浏览器控制台（B-2026-006）。
- 改 Nuxt 插件或其新依赖后若见 503 / 模块 MIME 报错，先清 `node_modules/.vite` + `.nuxt/cache` 重启再说代码有问题（B-2026-009）。

## 2026-09-01（Malloy + AI）
- 00:01–00:28 — 前端 i18n 基础搭建与分批改造（`ff1e09c` → `ff9d79e`）：vue-i18n、语言选择弹窗、SettingsLanguage、library/Settings 国际化。

## 2026-08-31（Malloy + AI）

- 23:57–23:59 — 后端英译能力落地（`4c0ef51`、`78f7234`）：opus-mt-ja-en 注册、OpusEnglishEngine。
