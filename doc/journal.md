# 开发日志（Journal）

按时间倒序记录每次会话完成了什么（精确到时分）以及对应 commit。Bug 的详细分析见 [bugs-and-fixes.md](./bugs-and-fixes.md)。

---

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

## 2026-09-01（Malloy + AI）
- 00:01–00:28 — 前端 i18n 基础搭建与分批改造（`ff1e09c` → `ff9d79e`）：vue-i18n、语言选择弹窗、SettingsLanguage、library/Settings 国际化。

## 2026-08-31（Malloy + AI）

- 23:57–23:59 — 后端英译能力落地（`4c0ef51`、`78f7234`）：opus-mt-ja-en 注册、OpusEnglishEngine。
