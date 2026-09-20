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

### 待决（需 Malloy 定）
1. 9 个 key 是**冗余别名**（同句文案已有在用的 key）：`reader.copy`、`settings.title`、`autoTranslate.cancel` 等 → 建议删。
2. 34 个 key 是**孤儿**，其中至少 `library.deleteBook`、窗口控制三键属该接线而未接线（兼无障碍缺陷）→ 建议接上；其余（`settings.token`/`library.editBook` 等）需确认是待开发功能还是废案。
3. `useFileProcessor.ts:5` 在模块顶层调用 `useToast()`，当前因 `useToast` 不依赖 inject 而侥幸可用，属隐患。

## 2026-09-01（Malloy + AI）

- 00:01–00:28 — 前端 i18n 基础搭建与分批改造（`ff1e09c` → `ff9d79e`）：vue-i18n、语言选择弹窗、SettingsLanguage、library/Settings 国际化。

## 2026-08-31（Malloy + AI）

- 23:57–23:59 — 后端英译能力落地（`4c0ef51`、`78f7234`）：opus-mt-ja-en 注册、OpusEnglishEngine。
