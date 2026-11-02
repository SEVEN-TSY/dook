# UI框架迁移后的旧样式与说明清单

整理日期：2026-11-02。供用户判断删除范围，本文不执行删除。

范围：从手写CSS迁移到shadcn/ui、Radix、Tailwind后的遗留样式、历史设计和说明。依据当前工作区源码，包括尚未提交的内容；已有改动保持原样。

## 当前使用边界

- `src/renderer/src/main.tsx`仍依次加载`shared.css`、`global.css`、`workbench.css`、`shadcn.css`。
- `components/ui/`提供Button、Input、Textarea、Switch、DropdownMenu、Popover等基础控件。
- `workbench.css`继续负责主界面布局和业务组件外观，`shared.css`提供共用颜色变量、清除输入和统计环样式。
- `global.css`仍包含便签尺寸、任务行、贴边入口、胶囊和窗口过渡等实际使用的规则，也包含部分被主界面继承的基础样式。
- `InlineComposer`继续使用定制textarea和按钮。接入UI框架后，定制控件与CSS仍有实际用途。

因此，删除判断需要落实到具体选择器或完整失去入口的文件。

## A. 有明确替代或失去引用的删除候选

下列编号可直接用于确认范围。行号为整理时的位置。

| 编号 | 位置 | 过时内容及依据 | 建议范围 |
| --- | --- | --- | --- |
| A1 | `src/renderer/src/styles/global.css:709` | `.setting-row input[role='switch']`及伪元素、选中、禁用、减少动效规则。设置页已使用Radix Switch，实际开关为`data-slot='switch'`组件，不再渲染旧input开关 | 删除旧input开关专属规则；保留仍使用的`.setting-row`布局 |
| A2 | `src/renderer/src/styles/global.css:1058` | `.task-more summary`、`summary::-webkit-details-marker`、`summary:hover`、`.task-more[open] summary`和`.task-menu`相关规则。任务菜单已使用DropdownMenu，触发器为按钮，内容类为`task-actions-menu` | 删除旧details/summary菜单专属规则；`.task-more`本身仍有引用 |
| A3 | `src/renderer/src/styles/global.css` | 渲染源码中已没有`task-toolbar`、`task-brand`、`task-count`、`task-intro`、`back-button`、`settings-hint`、`habit-add`、`quick-add`元素；对应的基础规则及`.note`变体仍保留 | 删除这些失去元素的选择器。脚本中仍有`.back-button`操作及`.task-toolbar`不存在断言，脚本引用需分别判断，不能一并机械删除 |
| A4 | `src/renderer/src/styles/workbench.css:260` | `.composer-hint`及其响应式/详情变体已没有对应元素；当前输入提示使用textarea的`aria-description` | 删除该类的规则 |
| A5 | `src/renderer/src/styles/workbench.css:587`、`:631`、`:1375` | `.habit-add`、`.settings-hint`、`.quick-add`对应元素已经消失；习惯新增采用InlineComposer | 删除这些类的规则。`:1375`处为多选择器共用声明，只移除`.quick-add`这一项，保留其他选择器 |
| A6 | `src/renderer/src/styles/global.css:56` | `.tasks-page.main`对应旧主界面布局。TasksPage的主界面分支已提前返回`.workbench`；后面的`.tasks-page ${kind}`分支实际用于便签 | 删除旧`.tasks-page.main`规则；保留`.tasks-page`共用规则及`.tasks-page.note` |
| A7 | `src/renderer/src/styles/layout.css:1` | 工程验证阶段的深色侧栏、技术栈卡片、架构流程和运行状态布局；当前源码没有导入该文件 | 可整文件删除 |
| A8 | `src/renderer/src/features/diagnostics/DiagnosticsPage.tsx:1` | 旧工程验证页未被当前应用入口引用；`useDiagnostics.ts`只由该页使用，`components/StatusBadge.tsx`也只由该页引用 | 若不保留旧验证页，可将这三个文件与A7一组删除。主进程诊断服务、MCP诊断工具和共享诊断接口继续保留 |

定位依据：`SettingsPage.tsx`导入Switch；`components/ui/switch.tsx`使用Radix Root/Thumb；`TasksPage.tsx:543`使用DropdownMenu；`TasksPage.tsx:341`返回工作台；`TasksPage.tsx:698`为便签分支；`main.tsx:1`可见当前样式加载链。

以上为源码引用和渲染分支审阅结果，本轮未删除样式，也未运行页面验证。

## B. 历史设计与原型，由用户决定是否保留

| 编号 | 位置 | 判断与删除影响 |
| --- | --- | --- |
| B1 | `doc/ui-style-research.md` | 早期审美调研，保留“清爽原生／温润纸感／紧凑工具”三个候选和旧布局建议。正文已有“锁定位置”“预计天数”“临时编辑浮层”等后来未采用的建议；开头明确作为历史依据保留。可整篇归档或删除，现行规则分别见设计语言和便签规范 |
| B2 | `doc/ui-style-guide.md`中的旧主界面说明 | 开头已注明主界面相关旧描述保留为历史参考。可删旧主界面布局、管理页共用描述及“分类呈现与主界面”中的历史安排，保留便签仍采用的尺寸、交互与动效规则；需要逐段处理 |
| B3 | `doc/assets/ui/main-window-reference.png` | `doc/design-language.md:3`已明确标为历史参考。可删除旧图并处理该链接；`desktop-style-reference.png`仍是便签规范中的视觉基准，单独保留 |
| B4 | 灵感A/B/C探索原型 | `InspirationPrototype.tsx`、`inspiration-prototype.css`、`PrototypeSwitcher.tsx`、`scripts/inspiration-prototype.mjs`及`package.json`中的`prototype:inspiration`。正式页面已采用分组导航，原型保留三种方案和演示数据。开发环境仍可通过`main.tsx`的`?prototype=inspiration`分支进入，属于可运行历史原型；删除时需同时移除入口、脚本命令和动态导入。原型文件当前有未提交修改，需保留其变更或明确放弃后再删除 |

## C. 过时说明，建议更新或合并

| 编号 | 位置 | 已过时或易混淆的说明 | 建议 |
| --- | --- | --- | --- |
| C1 | `docs/research/shadcn-integration.md:94`之后 | “本轮已接入的代码”仍写“当前没有Portal组件”；改造清单把Popover、DropdownMenu列为下一批；后文又记录两者已落地。当前源码已存在Portal，`workbench.css:1025`也明确处理挂载在body下的菜单和Popover | 合并为一份迁移后的现状，历史阶段说明可删或归档；保留省略Preflight、层叠优先级、主题变量和便签保护等依据 |
| C2 | `doc/codebase.md:41` | 样式入口只介绍global.css，缺少shared/workbench/shadcn的分工 | 更新样式结构说明，补充components/ui、InlineComposer及现有UI依赖 |
| C3 | `doc/codebase.md:39`、`doc/ui-style-guide.md:97` | 设置仍描述为系统偏好、便签偏好两组；当前SettingsPage已有个性化、系统偏好、便签偏好三组 | 更新分组和主题色说明 |
| C4 | `doc/todo.md`和`doc/design-language.md`中便签灵感展开列表的描述 | 当前便签仅提供新增灵感、当天数量及主界面快捷入口，没有灵感正文列表；`ui-style-guide.md`前半部分也仍保留折叠/展开灵感列表的旧描述 | 标明当前行为或单独保留为未来需求，避免当作现行界面规范；涉及产品范围，先由用户决定 |
| C5 | `README.md`启动说明 | 仍写“自定义排序、自启动留待后续”，也保留便签折叠灵感区、习惯修改只影响后续生成等旧行为 | 更新用户说明，保留README本身 |

## D. 继续保留的现行内容

- `doc/design-language.md`：布局、字体、层级、留白和交互规范仍适用，UI框架接入没有使这些设计原则失效；仅修订失真的局部说明。
- `doc/ui-style-guide.md`中的便签规则，以及`doc/capsule-window-motion-research.md`：便签仍依赖自定义尺寸、贴边、动效与原生窗口握手。
- `styles/shared.css`、`styles/workbench.css`、`styles/shadcn.css`、`components/ui/`及其许可：均在当前使用链上。
- `global.css`中的基础样式、便签规则及仍被主界面继承的布局：不能整文件删除。样式被后续CSS覆盖，也不足以直接认定整条规则可删。
- `.composer-inspiration`、`.nav-category-task/habit/inspiration`、`.docked-left/right/top`、`.note-motion-*`：通过模板字符串生成，静态全文查找可能漏掉实际引用。
- `.primary-button`、`.brand-mark`、`.nav-arrow`、`.detail-back`：当前页面仍有引用；`.space-label`仍由历史原型使用。
- `doc/habit-main-window-design.md`：明确是尚未选定的扩展设计，UI框架迁移不足以判定其过时。
- `docs/specs/ui-refinement-alignment-2026-11-02.md`：仍是待整体确认的需求草案，包含删除确认、灵感详情及默认视角等拟调整项。本清单未将草案当作已经实施的行为，也未据此把现有详情样式列为废弃。
- 旧改版规格、Issue讨论和ADR：包含业务决定与演变记录，若要归档，应另外标明后续规格的替代关系。

## 删除时的关联处理

- `doc/`目前被`.gitignore`忽略，仍需按本地实际文件纳入整理范围。
- 删除历史图片或文档时，同步处理保留文档中的链接；删除原型时，同步处理main入口和package脚本。
- A7/A8涉及旧渲染诊断页，范围止于该页面及其专属文件，不延伸到现行诊断能力。
- 当前工作区还有灵感组件、规格和烟雾脚本的未提交修改，本清单未覆盖或撤销这些修改。
