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

## 2026-09-01（Malloy + AI）

- 00:01–00:28 — 前端 i18n 基础搭建与分批改造（`ff1e09c` → `ff9d79e`）：vue-i18n、语言选择弹窗、SettingsLanguage、library/Settings 国际化。

## 2026-08-31（Malloy + AI）

- 23:57–23:59 — 后端英译能力落地（`4c0ef51`、`78f7234`）：opus-mt-ja-en 注册、OpusEnglishEngine。
