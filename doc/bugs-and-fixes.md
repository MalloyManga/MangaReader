# Bug 记录（Bugs & Fixes）

编号规则：`B-<年份>-<三位序号>`。每条记录：现象 → 根因 → 解决方式 → 验证 → 时间/commit。

---

## B-2026-001 i18n 改造遗漏：约 20 个组件/composables 残留硬编码文案

- **发现时间**：2026-09-20 13:20（上下文对齐阶段，脚本扫描）
- **现象**：分支上 i18n 批次改完 26 个文件后停住；`SettingsLanguage.vue` 用 `locale === 'zh' ? 中文 : English` 三元、`ConfirmModal`/`GlobalLoader`/`TokenizedWords`/`TitleBar`/`SettingsAbout`/`FileUpload` 空状态等仍硬编码中文，多个 composables 的状态消息（批量处理进度、模块元信息）也是写死的中文。
- **根因**：改造以"逐组件手改"推进，缺少**机器可校验的完成判据**，没有收尾扫描，做到一半中断即遗漏。
- **解决方式**：
  1. 全部收进 `t()`（en 用母语级英文，zh 中文；自称类文案如"中文/English"保留原文）；
  2. 模块元信息（`useDetectionModuleStatus`/`useDictionaryStatus`）在 composable 被调用时按当前 locale 刷新，替代模块加载时写死；
  3. 连带修复：`img[alt^="当前图片"]` 选择器在英文界面下会失效（alt 被 `t()` 本地化后前缀变了），改为语言无关的 `img[data-current-image]`（FileUpload.vue 打标，reader.vue 两处 + useAutoTranslateProcessing.ts 一处改用）；
  4. 校验脚本发现两个**被引用但不存在**的 key：`autoTranslateWorkflow.preparingBatch`、`autoTranslateWorkflow.pageCompleted`（改造前就存在），已补齐；
  5. 建立验证三件套：en/zh key 集合 diff = 0；模板引用 `t('…')` 全部可解析；非注释行中文残留扫描 = 0。
- **验证**：dev server 四个路由 200、日志无错误。
- **Commit**：`f4083fb`（2026-09-20 14:21）
- **遗留**：翻译模型 name/description 以后端 Python registry 下发为准，目前只有中文描述——英文界面会显示中文模型介绍，待后端处理（见 B-2026-004）。

## B-2026-002 ConfirmModal 编译失败：defineProps 解构默认值引用 `t()`

- **发现时间**：2026-09-20 14:21 之后（Malloy 运行 dev server 时报 `vite:vue` 编译错误）
- **现象**：`const { title = t('common.confirmTitle'), ... } = defineProps<Props>()` 无法编译。
- **根因**：Vue 3.5 会把 `defineProps` 的解构默认值**编译期提取**成 props 工厂（等价 `withDefaults`），该上下文里不存在 setup 中定义的 `t`，编译器直接拒绝引用局部变量。
- **解决方式**：props 声明为可选，去掉解构默认值，改在模板中 `title ?? t('common.confirmTitle')` 回退。额外收益：默认文案随语言切换**响应式更新**（原方案即便能编译也是 setup 时求值一次的快照）。
- **验证**（2026-09-20 14:35）：dev server 重启后 `/`、`/library`、`/reader`、`/auto-translate` 全部 200；`/library` 页面（index.vue 使用了 ConfirmModal）SSR 编译干净；dev 日志无任何 vite:vue 报错。
- **教训**：i18n 默认文案不要放进 `defineProps`/`withDefaults` 的字面默认值，用"可选 prop + 模板回退"模式。

## B-2026-003 `nuxt typecheck` 无法运行（环境问题，非代码错误）

- **发现时间**：2026-09-20 13:25
- **现象**：`npx nuxt typecheck` 抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`（vue-tsc 在 Node v22.14.0 下崩）。
- **根因**：npx 缓存的 vue-tsc 版本与 Node 24/npx 解析路径不兼容；项目 devDependencies 里也没有 vue-tsc。
- **解决方式**：暂以"Vite 编译 + dev server 路由冒烟"替代类型检查。**未彻底解决**——后续应把 `vue-tsc` 加为 devDependency 并固化 Node 版本。


## B-2026-004 后端翻译模型元信息无英文（已解决，见 B-2026-008）

- **发现时间**：2026-09-20
- **现象**：英文界面下 Settings > 翻译 卡片显示中文模型与中文描述。
- **实际根因**：不是"registry 缺 locale 字段"——registry 早已给每个模型带 `target_languages`，且 `opus-mt-ja-en` 的 name/description/size 本就是英文；真正的问题是参数在 Electron IPC 链上被丢弃、默认模型又不按语言取（B-2026-008）。
- **结论**：语言作用域打通后，英文界面只会拿到 `opus-mt-ja-en`（英文信息），中文界面拿到 3 个中文模型（中文信息），**无需再做文案 key 化**。保留此条是为记下我最初的误判。
- **遗留**：`app/composables/useModelStatus.ts` 的 fallback 目录（Electron/后端不可用时的兜底）仍是中文文案，且只含 `zh` 模型；若要它也有英文，需要补一份英文 fallback。

## B-2026-005 en/zh.json 存在重复 key：`autoTranslateWorkflow.pageProgress`

- **发现时间**：2026-09-20 14:50（Malloy 指出；此前 B-2026-001 的验证脚本用 `Object.entries` 拍平 key，重复 key 在 JSON.parse 时被静默合并，**结构性漏检**）
- **现象**：`autoTranslateWorkflow.pageProgress` 在 en.json 与 zh.json 中各出现两次（正文一处 + 尾部逗号风格追加块一处），值相同。属改造前遗留。
- **根因**：历史上有人用"末尾追加 `,"key": ...`"的方式批量加 key，未与正文去重；且当时的校验只做两边集合 diff，检测不到单文件内重复。
- **解决方式**：删除追加块中的重复项，保留正文定义；校验脚本升级为**按原文行扫描记录重复**（不再依赖 JSON.parse），并补充 unused-key 报告。复跑结果：en/zh 各 374 键、无重复、无缺失。
- **验证**：dev server 下 `/`、`/library`、`/reader`、`/auto-translate` 全部 200。
- **教训**：i18n 校验必须包含①单文件内重复 key ②两边集合 diff ③引用可解析 三项；JSON.parse 会吞掉重复 key，不能作为查重手段。

## B-2026-006 `ReferenceError: useI18n is not defined`（app 初始化崩溃）

- **发现时间**：2026-09-20 15:00（Malloy 运行时报错；此前 B-2026-001 声称"改造完成"，但 dev server 路由 200 掩盖了它）
- **现象**：`error caught during app initialization ReferenceError: useI18n is not defined`。
- **根因**：项目**没有安装 `@nuxtjs/i18n` 模块**，只用 `app/plugins/i18n.ts` 手写 `createI18n` 并 `vueApp.use()`。Nuxt 的自动引入只覆盖自家 `app/composables`、`app/utils` 与 Vue/Nuxt 内置 API，**不含第三方包导出**（见 `.nuxt/imports.d.ts`，其中只有 `useSettings`、`useToast` 等，无 `useI18n`）。因此 `useI18n` 必须显式 import。仓库里 31 个文件都显式 import，唯独 5 个 composable 漏了：
  - 早前 i18n commit 遗留：`useFileProcessor`、`useDetectionModuleStatus`、`useTranslatedImageExport`
  - 本次改造引入：`useDictionaryStatus`、`useModelStatus`
  `app.vue` 启动即调用 `useModelStatus().checkAllModelStatus()` → 首次求值就抛 ReferenceError。
- **为何此前没被发现**：`ssr: false`，`curl` 拿到的只是外壳 HTML，**运行时错误不会体现在 HTTP 状态码里**；而浏览器控制台未被读取。
- **解决方式**：5 个文件补 `import { useI18n } from 'vue-i18n'`（与仓库既有惯例一致，优于改 nuxt.config 配 `imports.presets`——后者会与 31 处显式 import 形成两套约定）。
- **验证**：浏览器加载 `http://localhost:3000/#/`，控制台无 error；`🚀 App Launched` 正常输出；Settings > General 面板渲染出英文 `SudachiDict-core / Approx. 207 MB`，证明 `useDictionaryStatus` 内的 `t()` 可用。
- **教训**：①"路由 200"不等于运行时无错，SPA/`ssr:false` 必须读浏览器控制台；②判断某 API 是否自动引入，唯一可信依据是 `.nuxt/imports.d.ts`，不能凭 Nuxt 一般印象。

## B-2026-007 setup 之外调用 `useI18n()` + 未使用 key 的误判

- **发现时间**：2026-09-20 15:10（修 B-2026-006 时自查；未使用 key 部分由 Malloy 质疑后复查）
- **现象一**：`useAutoTranslateSession.ts` 的 `createBatchState()` 里写了 `useI18n().t(...)`。该工厂除经 `useState` 初始化器（setup 内）调用外，还被 `resetSession()` 在切换书籍等运行期调用——那时已脱离 setup 上下文，`useI18n()` 会失败。
- **解决一**：把 i18n 实例从插件中抽出为 `app/locales/instance.ts`（插件只负责 `vueApp.use(i18n)`），非组件上下文改用 `i18n.global.t(...)`。
- **现象二**：我此前报告"44 个未使用 key 属早期脚手架残留"，该结论有两处错误：
  1. 扫描器只匹配 `t('字面量')`，漏判三元与变量 key —— `messages.languageChanged` / `languageChangedEn`（`t(cond ? 'a' : 'b')`）实为已用，属**误报**；
  2. 剩下的 key 也不是脚手架：`git log -S` 显示这些点号 key 在**任何历史 commit 的代码中都没出现过**，即建词表时写入但从未接线。按中文值再分类：**9 个是冗余别名**（同句文案已有在用的 key，如 `settings.title` 与 `common.settings`），**34 个是孤儿**——其中 `library.deleteBook`、窗口最小化/最大化/关闭按钮等，对应的是**今天没有任何 `title`/`aria-label` 的纯图标按钮**，即 i18n 未接线兼无障碍缺失，不是废文本。
- **解决二**：校验脚本落库 `scripts/check-i18n.cjs`（引用识别扩展到任意引号内的点号路径，排除 `="a.b"` 这类 HTML 属性值误报；报告重复/差集/缺失/未使用），并加 `npm run check:i18n`。
- **最终处置（2026-09-20 16:05–16:28，Malloy 决策）**：42 个从未使用的 key 全部删除（含 `settings.token`/`removeToken`、`library.editBook`、`about.description` 等），locale 总数 377 → 335；`library.deleteBook` 与窗口最小化/最大化/关闭三键补上 `aria-label` + `title`（新增 `common.minimize`/`maximize`/`restore`，`MaximizeButton` 随 `isMaximized` 在最大化/还原间切换）。复跑校验：无重复、零差集、零缺失、未使用 = 0；浏览器控制台无 error，中英文下三键分别读出 `最小化/最大化/关闭` 与 `Minimize/Maximize/Close`。
- **验证留手**：`library.deleteBook` 的 tooltip 仅静态验证——纯浏览器环境下 `window.electronAPI` 不可用，无法向书架添加书籍，未能亲眼见到该按钮渲染。
- **教训**：未使用 key 要先分辨"误报 / 冗余别名 / 该接未接"，不得直接打成脚手架残留；纯图标按钮缺可访问名本身就是 bug。
- **补充（2026-09-20 18:30，Malloy 复查后发现新的漏检）**：`reader.vue:540` 的 `📚 返回书架` 当时未被扫出。原因是我的过滤用了 `grep -vF 't('`，本意是排除"已走 i18n 的行"，但它同时把含 `emit(`、`get(` 的行整行排除了。已改为在 `scripts/check-i18n.cjs` 里做**剥离注释与 `console.*` 后的 CJK 扫描**，不再依赖这类脆弱过滤。

## B-2026-008 模型列表不随目标语言变化：Electron IPC 三跳丢弃了参数

- **发现时间**：2026-09-20 17:55（Malloy 提出第 5 点：翻译模型应只显示对应语言的模型，且模型信息也要是该语言）
- **现象**：英文界面下 Settings > 翻译 仍是 3 个日译中模型，描述为中文。
- **根因（两层）**：
  1. **参数在 IPC 链上被丢掉**：`useModelStatus` 调的是 `window.electronAPI.listTranslationModels(settings.value.targetLanguage)`，且 `app/types/interface.d.ts:174` 已声明 `targetLanguage?: string`；但实现侧 `electron/preload.js:64` 是无参 `() => invoke('model:list')`、`electron/ipc/backend-api.cjs:102` 的 handler 不接该参数、`electron/backend-service.cjs:327` 的 payload 也没有 `target_language`。后端 `handlers_translate.py:75` 取不到就恒按 `"zh"` 过滤。类型声明与实现不一致，使前端"看起来已经传了"。
  2. **默认模型不按语言取**：`handle_list_translation_models` 返回全局 `DEFAULT_TRANSLATOR_ID`（全体模型中体积最小 = `opus-mt-ja-zh`），即使语言传对，英文默认仍指向中文模型。
- **解决方式**：三跳逐层透传参数；新增 `get_default_translator_id_for_language()`；前端 `modelsLoaded` 改为按语言缓存（`modelsLoadedLang`，否则切语言不会重拉），拉取后把目录裁剪为当前语言，已选模型不属该语言时自动切到该语言默认。
- **验证**：Python 直调注册表 → `zh: [opus-mt-ja-zh, sakura-1.5b, qwen3…] / default=opus-mt-ja-zh`，`en: [opus-mt-ja-en] / default=opus-mt-ja-en`（英文描述）。**Electron 全链路（preload → ipc → backend）与模型卡片实际渲染尚未实机验证**，需 `npm start` 跑一轮。
- **Commit**：`de2fade`、`cd50b62`
- **教训**：跨进程 API 的参数要每一跳都核对实现，`interface.d.ts` 的声明不是证据；缓存标志位若隐含语义维度（此处为语言），必须把该维度纳入缓存 key。

## B-2026-009 dev server 503 与 "MIME type text/html" 报错（环境，非代码缺陷）

- **发现时间**：2026-09-20 18:40
- **现象**：重写 `app/plugins/i18n.ts` 并新增 `app/locales/instance.ts` 后，首页返回 503，控制台报 `Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"`（URL 为 `/assets/plugins/i18n.ts`）。
- **根因**：Vite 模块图/依赖缓存脏了（新增被插件引用的模块后 dev server 未重建映射），请求落到 SPA HTML 兜底路由。
- **解决方式**：杀掉 dev server，删除 `node_modules/.vite` 与 `.nuxt/cache` 后重启 → 首页 200、控制台仅剩 `Electron API not available` 一类预期告警。代码未作改动。
- **教训**：改动 Nuxt 插件或其新依赖后若出现模块 MIME/503，先清缓存重启，再怀疑代码。

## B-2026-010 下载源设置对翻译模型无效：选"官方"仍先走镜像

- **发现时间**：2026-09-20 22:15（Malloy 报告：明确选了官方源，日志仍出现 `OPUS file download failed from https://hf-mirror.com (attempt 1/5): <urlopen error [SSL: UNEXPECTED_EOF_WHILE_READING]>`，中文/英文 target 均如此）
- **现象**：Settings > 下载源 选"官方"后，翻译模型（opus-mt-ja-zh / opus-mt-ja-en / qwen3 GGUF）下载日志仍然先打镜像源、镜像 5 次重试失败后才回退官方。
- **根因**：链路 `store.downloadSource → backend.restart(source) → --download-source → Session.download_source` 前半段完好（electron 侧还会同步设 `HF_ENDPOINT`），但 `Session.get_or_create_translator()` 调 `get_translator_engine()` 时**没把 `download_source` 传下去**，三个引擎的构造函数根本没有该参数，`download_bases` 硬编码 `[镜像, 官方]`。引擎用 `urllib` 直连拼 URL，`HF_ENDPOINT` 对它们无效。OCR（`OCREngine`）与文字检测（`DetectionModuleManager.install`）都按"所选源优先、另一源兜底"实现，唯独翻译引擎漏了。
- **解决方式**：`translator/base.py` 新增 `ordered_download_bases(download_source)`（所选源排第一，另一源保留为 fallback，与 OCR 约定一致）；opus ja-zh / opus ja-en / qwen3 三个引擎构造函数接收 `download_source="mirror"`；`get_translator_engine()` 与 `Session.get_or_create_translator()` 逐层透传。sakura 引擎走 `hf_hub_download`，本就吃进程 env 的 `HF_ENDPOINT`，无需改；translate worker 只翻译不下载，维持默认值。
- **验证**：venv 直调工厂 → `official` 时三引擎均为 `[huggingface.co, hf-mirror.com]`，`mirror`/不传时镜像在前；直调 `Session("models","modules","official").get_or_create_translator("opus-mt-ja-en")` 确认接线；两源小文件 HEAD 均 200（日志里的 SSL EOF 属 hf-mirror 瞬时网络问题，非代码缺陷）。**Electron 实机下载链路未跑**，需 `npm start` 复验。
- **教训**：新增跨层设置时，要核对到**最终执行处**是否消费了该参数；"env 变量已设"不等于手写 HTTP 客户端会读它。同一职责（多源下载）在多处实现时，务必抽公共约定，否则新增实现会漏。
- **后续**：本修复对中文 target 已验证生效（选官方后日志首条即打 `huggingface.co`）。英文 target 表面"仍走镜像"，实为另一处缺陷，见 B-2026-011。**2026-09-21 补**：Malloy 实机复验中英文均按所选源优先下载，条目关闭。

## B-2026-011 英文 OPUS 模型永远下载失败：期望文件大小错误 + 416 续传死循环

- **发现时间**：2026-09-20 23:20（Malloy 反馈：B-2026-010 修好后中文正常，英文仍失败，日志 `OPUS English file download failed from https://huggingface.co (attempt 1/5): HTTP Error 416: Range Not Satisfiable`）
- **先纠正一个误判**：Malloy 推测"下载没真正用上新选的源"——**错了**。日志首条已是 `failed from https://huggingface.co`，证明 B-2026-010 的源顺序修复对英文同样生效。中英确实同一条链路，`download_bases` 排序一致；差别不在选源，而在英文引擎各自的 `required_files` 数值。
- **根因（两层）**：
  1. **期望大小 > 远端真实大小**：`OpusEnglishEngine.required_files` 多个值是错的（对照 HF API 实测）——`config.json` 记 1411 实际 **1381**、`pytorch_model.bin` 记 317638400 实际 **303294189**、`source.spm` 800768→**781853**、`target.spm` 821248→**801883**、`vocab.json` 1572864→**1501341**；且仓库根本没有 `special_tokens_map.json`（英文不需要，Marian tokenizer 用不到）。以 `config.json` 为例：文件其实已完整下完（1381B），但 `download_model` 判 `downloaded(1381) < expected(1411)` → 抛 incomplete → 外层 `for attempt` 用同一断点重发 `Range: bytes=1381-`。
  2. **416 无自愈**：远端总量只有 1381B，`Range: bytes=1381-` 越界 → 服务器返回 **416 Range Not Satisfiable**。旧代码不处理 416，5 次重试 + 换源后 5 次全部带同一非法 Range，永远救不回来，最终 `MODEL_DOWNLOAD_FAILED`。中文恰好所有 expected ≤ 实际，所以不触发。
- **解决方式**：
  1. 用 HF API 实测值修正 `opus_english_engine.py` 的 `required_files`，删除英文仓库不存在的 `special_tokens_map.json`；同步修正 `opus_engine.py`（中文）里偏离实测的 `source.spm`/`target.spm`/`vocab.json`/`special_tokens_map.json`。qwen3 的 GGUF 实测 2497280736 与代码一致，未改。
  2. 三个引擎的 `_download_file` 加 **416 自愈**：`except urllib.error.HTTPError` 命中 416 且 `resume_from>0` 时，删除 `.tmp`、清 `Range` 头、整体重下（而非带非法断点空转）。
- **验证**：venv 直调 `OpusEnglishEngine._download_file`——case1 用现场那个 1381B 的 `config.json.tmp` + expected=1381，直接转正返回、不重复下载；case2 构造 1500B 越界 tmp + expected=2000，触发 `[WARN] OPUS English got 416 ... discarding .tmp` 自愈分支、tmp 被清除重下；case3 干净全量下载 config.json 得 1381B。`py_compile` 三文件通过。磁盘上 `models/translation/opus-mt-ja-en/config.json.tmp`(1381B) 未手删——新逻辑下点击下载会自动被转正。**Electron 实机完整下载（约 300MB）仍未跑**。→ **2026-09-21 闭环**：Malloy 实机复测，选官方源完整下载 opus-mt-ja-en 成功、日志无 416，条目关闭。
- **教训**：硬编码的"期望文件大小"必须对齐远端真实值，否则"下完了却永远判 incomplete"，且续传逻辑会把这个矛盾放大成 416 死循环。校验语义要分清"最小值"与"精确值"：`check_model_exists` 用 `>=`（最小值语义）能容忍，但 `download_model` 的完成判定用 `< expected`（近似精确值语义）就不容忍偏大——两处对同一 dict 的隐含假设不一致是本次英文独有的诱因。给手写 HTTP 客户端加 Range 续传时，必须处理 416。

## B-2026-012 英文嵌字逐字母拆分：嵌字管线只有日语竖排一条路

- **发现时间**：2026-09-21 13:50 前后（Malloy 报告：英文翻译模型已跑通，但嵌字把译文一个字母一个字母拆开；且英文译文常比日文明显更长）
- **现象**：目标语言选英文后，实时叠层与 PNG 导出中的英文译文全部竖排、逐字母堆叠，单词被打散、无法阅读。
- **根因**：整套嵌字管线是为日语竖排写的，且**没有任何按语言的分支**——
  1. `useTranslatedImageExport.ts` 的 `drawVerticalText` 用 `Array.from(translation)` 把字符串拆成码点，逐字符画进 `fontSize*1.08` 宽的固定竖排单元格；
  2. `BubbleLayer.vue` 无条件套 `writing-mode: vertical-rl` + `text-orientation: upright` + `break-all`，拉丁字母被迫逐字竖排直立即逐字母断行；
  3. 翻译数据链路（`translateBlock → ipc ocr:translate → handle_translate`）只回传 `{ translation, model_id }`，渲染端拿不到语言信息；`DetectedTextRegion.direction` 存在但渲染端从不读。
- **解决方式**：按**译文文字系统**分支（不依赖设置项，历史书页换语言后也能正确渲染）：
  1. 新增 `app/composables/textLayout.ts`：`usesLatinScript()`（非空白字符中拉丁占比 > 50% 判为横排，数字/标点为主仍走竖排）与 `wrapLines(measure, text, maxWidth)`（按词 greedy 换行、超宽长词按字符硬切的纯函数，measure 注入以便脱离 canvas 测试）；
  2. `useTranslatedImageExport.ts` 新增 `drawHorizontalText`：canvas `measureText` 真实量宽逐行排布，字号从面积启发式起步、最多收缩 40 轮直至装下，绘制仍 clip 在气泡矩形内；`renderTranslatedPage` 按 `usesLatinScript` 分派横/竖两条路；
  3. `BubbleLayer.vue`：容器类按 `isLatinBlock` 切换——拉丁走 `bubble-horizontal`（horizontal-tb + 正常按词换行），CJK 保留原竖排；字号启发式对拉丁用 0.72 面积系数（拉丁字形窄于全角）；另加 `v-fit-text` 局部指令，挂载/更新后按 `scrollWidth/scrollHeight` 实测溢出、以 0.88 步进缩到 ≥6px，兜住"译文过长"。
- **验证**：
  1. `wrapLines`/`usesLatinScript` 经 esbuild 转译后在 Node 跑断言：按词换行结果与逐词宽度约束、长词硬切不丢字符、多空格/换行输入归一、空文本、单字符超宽不死循环——全过；
  2. `@vue/compiler-sfc` 编译 `BubbleLayer.vue` 通过，模板正确引用 `vFitText` 绑定；
  3. 真实浏览器（dev server :3002）：动态 import 真实模块，`drawHorizontalText` 在 canvas 上画出按单词换行的英文（截图确认，含 24 字符长词）；挂载真实 `BubbleLayer` 组件渲染 4 个混合气泡——英文横排断词正确、日文竖排不变、超长英文句自动缩到 9px 仍在框内；逐 span `getBoundingClientRect` 对比气泡盒：四块 overflow 均为负（无溢出）；控制台无新增错误（仅浏览器环境固有的 Electron API 缺失告警）。
  **Electron 实机（真图 + 真译文）未跑**。
- **教训**：为单一文字系统写的排版管线（逐字符竖排）在复用前先问"另一种文字系统怎么办"；嵌字/换行必须区分"按字符"与"按词"两种模型。渲染分支优先看**内容本身**而非设置项：设置会变，已入库的译文不会重译。
- **时间/commit**：2026-09-21 14:35，`fd12c2a`（Malloy 实机验证通过后仅提交前端 3 文件）。
