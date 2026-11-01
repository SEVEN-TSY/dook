# shadcn/ui接入调研

调研日期：2026-11-01。来源限于项目源码、官方文档和CSS规范。本文记录接入建议；依赖与源码现状为调研时快照，实施期间可能继续变化。

## 结论

建议在现有Electron渲染层渐进引入shadcn/ui，选择Radix实现，以主界面的Button、Input、Textarea、DropdownMenu为第一批组件。保留已有任务、习惯、灵感、草稿保存和DesktopApi，不重建业务状态。主界面的侧栏、开放列表和右侧详情继续按项目设计语言组织，组件默认主题仅作为可修改的起点。

官方已明确支持Tailwind4和React19，组件代码允许直接调整；接入React19无需迁移回React18。[官方Tailwind4说明](https://ui.shadcn.com/docs/tailwind-v4)

便签保护的核心是样式边界：不直接覆盖现有global.css，不向双窗口共同入口无条件加入整套Preflight和默认全局主题；将主界面主题、基础样式与Portal样式限定到`html[data-window='main']`。以下隔离、迁移顺序与验证建议是依据当前代码作出的工程判断。

## 当前工程与已有约束

- [package.json](../../package.json)已有React19.3.1、TypeScript6.0.3、Vite8.3.5、electron-vite6.0.0；调研时亦已出现Tailwind4.3.3、`@tailwindcss/vite`、`radix-ui`、`class-variance-authority`、`clsx`、`tailwind-merge`和`lucide-react`。无需因安装教程重新初始化项目。
- [electron.vite.config.ts](../../electron.vite.config.ts)分别配置main、preload和renderer；新增UI构建插件和别名应放renderer内。
- [main.tsx](../../src/renderer/src/main.tsx)共同导入[global.css](../../src/renderer/src/styles/global.css)，[App.tsx](../../src/renderer/src/App.tsx)根据查询参数确定main/note并设置`document.documentElement.dataset.window`。两个窗口共享组件源码，CSS入口需要主动限定影响范围。
- [TasksPage.tsx](../../src/renderer/src/features/tasks/TasksPage.tsx)包含任务编辑、菜单、切页及保存协调；主界面与便签有各自分支。迁移控件时保留`flush`、组合输入处理、保存失败草稿与原事件调用顺序。
- [设计语言](../../doc/design-language.md)明确主界面蓝白、约190px侧栏、开放列表与右侧详情，桌面便签暂沿用旧规范；[改版规格](../../doc/main-window-redesign-spec.md)要求共享数据、保存机制与窄窗口返回行为。
- [ADR0001](../adr/0001-inspiration-organization.md)要求灵感按日期/主题归集、正文原地编辑与右侧补充详情。本次组件替换不改变这些决定。

## 官方安装路径与项目适配

官方Vite既有项目流程包括Tailwind插件、TypeScript与Vite别名、初始化和按需添加组件；其中“替换整个index.css”的示例针对普通起步工程，本项目采用保留旧CSS、另建主界面样式入口的适配方案。[Vite安装指南](https://ui.shadcn.com/docs/installation/vite)

1. 在`electron.vite.config.ts`的`renderer.plugins`加入`tailwindcss()`；已有React和开发期CSP插件保留。Tailwind官方提供`@tailwindcss/vite`，electron-vite官方配置允许在renderer中使用Vite配置。[Tailwind Vite插件](https://tailwindcss.com/docs/installation/using-vite)、[electron-vite配置](https://electron-vite.org/config/)
2. 若选`@/`别名，将其解析到`src/renderer/src`，同步写入`tsconfig.web.json`的`compilerOptions.paths`和renderer的`resolve.alias`。不要映射到同时包含main/preload的`src`根目录。此路径选择是项目适配建议，官方同时支持tsconfig paths和package imports。[别名配置](https://ui.shadcn.com/docs/components-json#aliases)
3. 创建`components.json`，设置`rsc:false`、`tsx:true`、`tailwind.config:""`、`tailwind.css`指向专门的主界面CSS，`cssVariables:true`，ui/utils别名指向renderer中的实际目录。Tailwind4无需创建旧版tailwind.config.js。[components.json说明](https://ui.shadcn.com/docs/components-json)
4. 使用当前CLI时明确选择Radix底层。官方CLI现提供`--base radix`，同时支持其他底层；`init`会修改依赖、cn工具与CSS变量，`add`按需添加源码和依赖。建议先审查生成的少量组件，避免一次添加全部。[CLI说明](https://ui.shadcn.com/docs/cli)

可参考的命令为`npx shadcn@latest init --base radix`和`npx shadcn@latest add button input textarea dropdown-menu`。本工程目录和配置不同于标准Vite模板，若CLI识别失败，按官方manual流程手动配置即可，仍以生成组件实际import为依赖依据。

调研时官方manual页示例已包含`shadcn`、`cn`、`tw-animate-css`以及`@import "shadcn/tailwind.css"`，与早期教程中的`clsx`＋`tailwind-merge`自建cn方案有差异。已有cn实现可以继续维护；选择最新registry时应同时检查其辅助CSS与工具依赖，不应只复制组件TSX。[官方手动安装](https://ui.shadcn.com/docs/installation/manual)

## CSS隔离与主题映射

Tailwind完整导入会自动注入Preflight，改变标题、边框、列表等基础样式；官方允许拆分导入并省略Preflight。`prefix(tw)`需要同时应用到theme和utilities导入，适合避免工具类命名冲突，不能代替对全局基础规则的隔离。[Preflight与拆分导入](https://tailwindcss.com/docs/preflight)

推荐初期只导入theme和utilities，给主界面组件补足明确的基础规则，尤其检查按钮背景、边框样式、输入框字体及图标尺寸。依赖Preflight的组件不能直接假定外观完整。动画辅助CSS也需要审查是否含全局选择器。

建议主题变量挂在`html[data-window='main']`上，以覆盖该窗口body中的Portal，同时不污染note窗口：

| shadcn语义变量         | 项目建议值 | 设计角色         |
| ---------------------- | ---------- | ---------------- |
| `--background`         | `#FAFBFE`  | 内容背景         |
| `--foreground`         | `#303744`  | 正文             |
| `--primary`、`--ring`  | `#526FC4`  | 主要操作与焦点   |
| `--primary-foreground` | `#FFFFFF`  | 强调色上的文字   |
| `--muted-foreground`   | `#6A7588`  | 次要信息         |
| `--accent`             | `#EDF2FC`  | 悬停与选中背景   |
| `--border`、`--input`  | `#E5EAF1`  | 细分隔与输入边界 |
| `--destructive`        | `#C74B55`  | 危险操作         |

这些值来自项目设计语言；语义变量通过`@theme inline`映射为工具类，遵循官方主题机制。保留现有系统字体栈，圆角和间距由具体组件按设计语言微调。[官方主题机制](https://ui.shadcn.com/docs/theming)

特别注意旧CSS的层叠优先级：当前global.css中的`button`、`input`及`.task-row`等规则都没有layer。CSS规范规定普通unlayered规则优先于具名layer中的普通规则，因此把Tailwind文件放在最后，仍可能出现旧按钮样式覆盖utilities的问题。[CSS Cascade5层叠顺序](https://www.w3.org/TR/css-cascade-5/#layer-order)

建议分批移除主界面已迁移控件所依赖的旧样式，便签继续保留原规则。若实施选择将旧CSS整体放入早于utilities的legacy layer，应把便签回归作为该改动的直接验证；也可用明确的主界面`[data-slot]`规则管理过渡外观。避免靠不断加`!important`维持两套样式。仅把Tailwind放进CSS Module也不能自动隔离其导入的全局规则。

为避免首次绘制时漏掉主界面主题，建议在渲染前同步设置`data-window`，复用当前查询参数判断；首次副作用设置可保留为一致性保障。这是针对当前App启动顺序的项目建议。

## Portal、焦点与桌面窗口

Radix DropdownMenu的Portal默认挂载到`document.body`，可通过`container`改变位置；Content提供`onCloseAutoFocus`、外部交互事件和碰撞处理。[DropdownMenu官方API](https://www.radix-ui.com/primitives/docs/components/dropdown-menu)

因此，主界面主题采用html级窗口标记较稳妥。若只在`.workbench`内定义变量或后代选择器，默认Portal会离开该作用域。若采用专门Portal容器，应把容器置于主界面主题范围内、避开列表滚动裁切和带transform的布局节点，并在本地封装中显式透传container；不要假设shadcn的Content封装自动暴露所有Portal参数。

Radix Dialog支持受控open、modal与非modal；modal会约束焦点，提供Title/Description、打开与关闭自动聚焦钩子，默认Portal亦进入body。[Dialog官方API](https://www.radix-ui.com/primitives/docs/components/dialog)

据此，宽窗口的常驻右侧详情继续采用普通面板；窄窗口是否使用Sheet/Dialog由实际覆盖与键盘行为决定。若关闭详情需先保存，将open设为受控，保存失败保留面板和草稿。菜单关闭后通常返回触发按钮；若菜单动作删除当前行或打开详情，则明确选择仍存在的目标焦点，避免恢复到已卸载节点。无需为每次关闭统一阻止Radix默认焦点行为。

`asChild`可把Radix行为组合到现有按钮；自建组件需透传props并确保ref到达DOM，同时保留可聚焦的语义元素。[Radix Composition](https://www.radix-ui.com/primitives/docs/guides/composition)

便签后续若使用Portal，除了样式，还需将弹层打开状态计入现有`setInteraction`保护；原本依赖容器内focus/blur的判断可能遗漏body下的弹层。这是基于项目贴边收起机制的推断。首轮仅迁移主界面能减少此耦合。

现有renderer CSP允许本地资源和inline style；初期使用本地图标、系统字体、构建后的CSS，无需新增远程脚本或字体来源。此结论来自当前[index.html](../../src/renderer/index.html)，不构成对所有后续组件依赖的兼容保证。

## 渐进迁移顺序

1. **构建与主题**：接入renderer插件、别名、cn和components目录；主界面限定主题；用一个按钮确认CSS层叠与便签隔离。
2. **低耦合控件**：主界面的Button、Input、Textarea、Separator及统一Lucide图标。原组件props继续调用现有动作，不新建第二套保存状态。
3. **菜单与提示**：先替换主界面任务行的`details/summary`更多菜单；保留归档、转为多天任务、习惯相关操作的可见条件和保存前置逻辑。顺带处理键盘、菜单外点击关闭、焦点返回与触发按钮可访问名称。
4. **复合控件**：按需求引入Checkbox、Switch、Progress、Tooltip和窄窗口Sheet。Checkbox的值允许indeterminate，业务任务完成值仍明确转换成boolean；设置变更继续走DesktopApi，进度继续使用现有领域计算。
5. **主界面清理**：移除对应旧CSS和手写符号，保留任务开放列表、灵感日期/主题导航与常驻详情；暂不照搬Card、Sidebar或完整dashboard模板。桌面便签迁移另行确定范围。

以上为本项目迁移建议，不新增需求，也不修改ADR0001。

## 有限验证与未确认项

接入实现后执行`npm run typecheck`和`npm run build`，再沿用现有Electron烟雾边界验证主界面导航、输入保存、任务菜单、双窗口同步及窄窗口详情。视觉只需针对改变的控件检查默认/悬停/焦点/禁用，以及便签透明背景、尺寸、折叠入口和编辑状态。菜单验证包括Escape关闭、方向键访问、删除后焦点与退出保存屏障。无需为仅转发props的包装组件新增逐行映射测试。

本文未运行安装命令、构建或真实Electron验证；官方支持React19和Tailwind4，不能直接推导出所有本地依赖版本与所有组件均已在当前Electron工程中验证。CLI对electron-vite多配置文件的自动识别、最新registry导出的具体依赖、无Preflight时每个组件的完整外观，仍需在实际接入时由少量组件确认。

## 本轮已接入的代码

本节为实施后记录，覆盖前文调研快照。报告放在`docs/research/`，因为项目的`doc/`目录被Git忽略。

- `electron.vite.config.ts`的renderer已接入Tailwind插件与`@/`别名，TypeScript同步配置；`components.json`提供后续按需添加组件的路径。
- `components/ui/`引入官方new-york-v4 registry的Button、Input、Textarea和Radix Switch，保留MIT许可；`lib/utils.ts`提供cn。源码来源：[官方registry](https://ui.shadcn.com/r/styles/new-york-v4/button.json)。
- `styles/shadcn.css`按项目蓝白色映射语义颜色，省略Preflight；当前没有Portal组件。组件专用基础规则仅命中data-slot，已有便签继续使用原生标签。
- 为兼容现有unlayered样式，本轮采用Tailwind官方utilities导入的`important`模式，避免把整个global.css移层影响便签。该决定是过渡方案；后续迁移控件要同步移除旧选择器，避免继续叠加高优先级覆写。[Tailwind important导入](https://tailwindcss.com/docs/styling-with-utility-classes#important-modifier)
- 深色variant显式由`.dark`控制，防止系统深色偏好单独改变部分控件；当前产品仍沿用现有浅色主题。
- 设置页4项偏好使用Switch，保留busy、失败反馈及DesktopApi；习惯页按钮和输入框已迁移；灵感主界面的新增、原文编辑、补充和主题表单使用Input/Textarea/Button。便签灵感分支保留原生控件。

## 逐模块改造清单

| 位置与现状                                             | 对应组件                                        | 优先级及处理方式                                                                       |
| ------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `SettingsPage.tsx`手写checkbox开关                     | Switch、Button                                  | 本轮完成。继续走updateSettings与保存屏障。                                             |
| `HabitsPanel.tsx`新增/编辑表单和行尾按钮               | Input、Button                                   | 本轮完成。保留组合输入、失焦保存和原生删除确认。                                       |
| `InspirationPanel.tsx`文本表单                         | Input、Textarea、Button                         | 本轮完成基础控件。页面布局及取消按钮尚待整体统一。                                     |
| `InspirationPanel.tsx`绝对定位的主题选择器、Escape处理 | Popover＋Input＋Checkbox；主题很多时评估Command | 下一批首选。补齐外点关闭、碰撞定位与焦点返回；保留多选串行写入，不把每次选择改为关闭。 |
| `TasksPage.tsx`的details/summary更多菜单               | DropdownMenu                                    | 下一批首选。主界面先迁移，保留任务类型/习惯状态对应的操作条件。                        |
| `TasksPage.tsx`行内新增与详情编辑                      | Input、Textarea、Button                         | 按主界面分支替换；保存逻辑仍由useTaskInput/useSerialSave负责。                         |
| `SubitemsPanel.tsx`子事项勾选、编辑及新增              | Checkbox、Input、Button                         | 第二批。明确checked===true，保留整项完成联动与IME行为。                                |
| 任务手动进度与只读进度                                 | Slider、Progress                                | 第二批。只读和可编辑分开；不要在拖动每一帧增加IPC写入。                                |
| 主界面与灵感的窄窗口详情                               | Sheet或普通响应式面板                           | 按现有返回/保存要求选择，保存失败保持详情；宽窗口仍用常驻面板。                        |
| `Icon.tsx`及散落的Unicode操作符号                      | Lucide图标＋Button/Tooltip                      | 逐模块统一图标大小与可访问名称；现有Icon已统一的部分无需重复替换。                     |
| 灵感成功/失败提示和task-error                          | Alert；必要时Sonner                             | 后续统一反馈。失败信息保留可操作性，不用定时消失的提示承载唯一错误。                   |
| 自定义导航与灵感日期/主题分组                          | Button或ToggleGroup                             | 低优先级。日期/主题是视角切换，不应为套Tabs而改变当前状态与滚动恢复。                  |
| `NoteTransition.tsx`、贴边能量条、统计环、新增胶囊     | 保留定制组件与CSS                               | 不套通用组件：尺寸、透明窗口、手势和动画握手直接参与桌面交互。                         |
| `InspirationPrototype.tsx`                             | 暂保留原型                                      | DEV原型入口不作为正式组件迁移目标，避免维护两套业务UI。                                |

本轮通过`npm run build`（包含TypeScript检查）、Electron workbench场景及note-archive首次操作/重启两阶段验证。截图位于`.local/smoke/`。这些检查覆盖已替换控件参与的业务操作，不表示后续Popover/DropdownMenu已迁移或验收。

## 主界面功能与操作改版

主界面独立组织功能，便签仅提取底层组件，不将便签内容、统计环或胶囊布局搬入主界面。

- 任务：日期与新增操作、开放列表、今天任务/持续推进分组、右侧详情。普通任务更多菜单使用DropdownMenu，包含转换、添加为习惯、置顶与删除；习惯任务仍按原规则暂停一次。菜单支持方向键、Escape和焦点返回。
- 灵感：日期/主题切换、单组导航、列表及补充详情。新增入口保留当前分组语境；主题归集改为Popover，支持搜索、多选、外点关闭及自动定位。窄窗口详情替换列表并保留返回。
- 习惯：独立列表展示每天执行的事项，统一新增、编辑和删除；继续使用既有自动生成与保存机制。
- 设置：直接展示系统偏好/便签偏好，移除重复标题及返回今天任务的额外入口，通过主导航切页。
- `styles/workbench.css`集中维护主界面样式，已从global.css移除130处旧主界面选择器，避免继续叠加覆盖。
- `components/AppIcon.tsx`、`components/TaskCheck.tsx`为双窗口共用基础组件；`components/SummaryRing.tsx`及`features/shared/useSummaryMotion.ts`从便签提取，统计环继续只在便签使用。`styles/shared.css`维护颜色变量与统计环样式，不包含原生窗口尺寸及贴边逻辑。

验证：生产构建、Electron工作台（含键盘菜单及多天任务布局断言）、便签归档首次操作/重启、主题管理首次操作/重启均通过。实际页面截图位于`.local/smoke/workbench-overview.png`、`workbench-task-menu.png`、`workbench-habits.png`、`workbench-settings.png`及`inspiration-topic-detail.png`。

后续设置调整：移除主界面面包屑及设置页副标题；设置按个性化、系统偏好、便签偏好分组，通过图标和分组容器区分。主题色使用WindowSettings.themeColor保存，支持预设、自定义六位十六进制颜色与恢复默认，App根据窗口状态同步更新CSS变量。IPC校验输入，旧偏好和无效持久化颜色回退到默认雾蓝色。
