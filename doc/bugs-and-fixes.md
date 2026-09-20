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


## B-2026-004（待办）后端翻译模型元信息无英文

- **发现时间**：2026-09-20
- **现象**：`services/modules/translator` registry 下发的模型 name/description/size 为中文，英文界面下 SettingsTranslate 卡片显示中文。
- **建议方案**：registry 增加 locale 字段或 key 化文案，由前端按当前语言解析。

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
- **解决二**：校验脚本落库 `scripts/check-i18n.cjs`（引用识别扩展到任意引号内的点号路径，排除 `="a.b"` 这类 HTML 属性值误报；报告重复/差集/缺失/未使用），并加 `npm run check:i18n`。接线与否待 Malloy 决策，未擅自删 key。
- **教训**：未使用 key 要先分辨"误报 / 冗余别名 / 该接未接"，不得直接打成脚手架残留；纯图标按钮缺可访问名本身就是 bug。
