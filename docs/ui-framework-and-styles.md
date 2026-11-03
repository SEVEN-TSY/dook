# 当前UI框架与样式结构

更新日期：2026-11-03。依据当前工作区源码，包含尚未提交的界面改动。本文总结已实现的结构；旧调研、需求草案和截图中的效果不自动视为当前行为。本次同步清理失去引用的旧CSS和工程验证页，现行组件、主题及窗口交互继续沿用。

## 1. 整体结论

当前UI采用**React＋TypeScript构建页面，shadcn/ui风格的本地组件结合Radix处理通用控件，Tailwind CSS4与项目CSS共同实现外观**。项目已抽取输入、列表正文、删除确认、提示和创建时间等共用能力。

主界面采用侧栏工作台、分组列表和独立滚动区域；桌面便签保留专用布局、输入胶囊、统计环、任务／小记切页及贴边动画。两窗口共享主题与部分组件，同时保留各自的交互实现。

源码中的`inspiration`目录、类型、API和CSS类名仍用于“小记”，界面业务用词以当前术语表的小记为准。

## 2. 框架与基础库

依据[package.json](../package.json)、[components.json](../components.json)和[electron.vite.config.ts](../electron.vite.config.ts)：

| 技术                                    | 当前职责                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Electron、React、TypeScript             | 双窗口宿主、页面渲染和类型约束                                                      |
| shadcn/ui配置及`components/ui/`本地源码 | Button、Input、Switch等可直接修改的基础组件；配置为new-york风格、slate基色和CSS变量 |
| Radix                                   | DropdownMenu、Popover、Select、Switch、ToggleGroup及AlertDialog的交互与焦点行为     |
| Tailwind CSS4、`@tailwindcss/vite`      | 基础组件的工具类、状态变体及主题语义颜色；已接入renderer构建                        |
| `class-variance-authority`              | Button、Toggle等组件的变体和尺寸组合                                                |
| `clsx`、`tailwind-merge`                | `cn()`组合条件类名并合并冲突的Tailwind工具类                                        |
| Lucide、项目自绘SVG                     | 通用操作图标，以及AppIcon、TaskActionIcon和品牌标识                                 |
| Sonner                                  | 两窗口共用的成功、错误等浮动提示                                                    |

`components/ui/`既包含基础组件源码，也包含ClearButton、ClearableInput、ClearableTextarea等项目定制扩展。当前业务直接使用Button、Input、Switch、DropdownMenu、Popover、Select和ToggleGroup；独立的Textarea源码仍保留，主要正文编辑由定制textarea组件承担。

## 3. 样式文件分工

[main.tsx](../src/renderer/src/main.tsx)按以下顺序共同加载四个CSS文件：

| 加载顺序 | 文件                                                      | 当前职责                                                                                                         |
| -------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1        | [shared.css](../src/renderer/src/styles/shared.css)       | `--app-*`语义颜色、复选框、清除按钮、可清除输入容器、统计环和共用焦点规则                                        |
| 2        | [global.css](../src/renderer/src/styles/global.css)       | 字体与基础元素、便签布局和任务行、任务／小记切页、贴边胶囊与窗口动效、两窗口删除弹窗，以及仍在使用的共用基础规则 |
| 3        | [workbench.css](../src/renderer/src/styles/workbench.css) | 主界面侧栏、标题、任务分组、列表正文编辑、习惯／小记／设置布局、滚动区、响应式布局和部分Portal浮窗外观           |
| 4        | [shadcn.css](../src/renderer/src/styles/shadcn.css)       | Tailwind入口、框架语义颜色映射、`data-slot`基础修正和深色variant                                                 |

这是“共用变量＋项目页面CSS＋组件工具类”的组合。主界面仍继承global.css的部分基础规则，workbench.css尚未完全独立于它。

### 层叠与作用域

- shadcn.css只导入Tailwind的theme和utilities，省略Preflight，基础元素重置仍主要由项目维护。
- utilities使用`important`导入，应对现有未分层CSS；旧CSS内部仍按选择器优先级和声明顺序决定覆盖关系。
- 主界面页面规则主要限定在`.workbench`内，便签规则主要限定在`.note`内。四个CSS均由两窗口加载，`shared.css`、全局基础规则及`data-slot`修正会跨窗口生效。
- Popover、DropdownMenu、Select和AlertDialog使用Portal。主题变量位于根节点；主界面部分浮窗通过`html[data-window='main']`限定，删除弹窗使用两窗口共用的全局类。
- 当前未采用CSS Modules；不能仅根据文件名或加载顺序判断某条规则是否已失效。

## 4. 主题、外观与窗口

主题链路见[App.tsx](../src/renderer/src/App.tsx)、[SettingsPage.tsx](../src/renderer/src/features/settings/SettingsPage.tsx)和[desktop.ts](../src/main/desktop/desktop.ts)：

1. 设置提供随系统、浅色、深色，以及六个预设主题色、自定义颜色和恢复默认。
2. 主进程通过Electron的`nativeTheme`解析外观，并将实际`colorScheme`广播到窗口。
3. App更新根节点的`data-theme`、`.dark`和`color-scheme`；启动初始绘制先采用系统外观，随后接收持久偏好。
4. `--app-accent`保存主题强调色，App依据亮度选择强调色上的深色或白色文字。
5. shared.css通过`light-dark()`提供浅深色表面与文字，通过`color-mix()`派生悬停、选中、边框和进度颜色。
6. shadcn.css将这些变量映射为primary、accent、background、input、ring等框架颜色，两套控件使用同一主题来源。

主界面默认强调色为雾蓝`#526fc4`，浅色以白／冷白为主，深色以`#202020`等中性深灰为主。小记便签输入和统计环仍使用暖黄色语义色，列表圆点随当前主题色。

[window.ts](../src/main/desktop/window.ts)中主界面初始为1000×760、最小宽680，使用隐藏标题栏和原生窗口按钮；按钮背景与符号颜色跟随浅深色外观。渲染层顶部提供原生拖动区域。便签初始为334×480，保留透明、无标题栏、不占任务栏等窗口形态。

## 5. 已抽取的共用UI能力

| 组件                                                                                                       | 当前用途与边界                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [ListDescription](../src/renderer/src/features/shared/ListDescription.tsx)                                 | 主界面任务、习惯、小记共用正文预览和原地编辑：单行省略，编辑时展开，焦点定位末尾，并接入清除和各自草稿保存               |
| [InlineComposer](../src/renderer/src/features/shared/InlineComposer.tsx)                                   | 共用新增输入表面、主题色加号、清除和确认图标；ComposerToggle控制展开并旋转加号。提交、失焦和离开时的保存策略由调用方决定 |
| [ClearButton](../src/renderer/src/components/ui/clear-button.tsx)、ClearableInput、ClearableTextarea       | 统一清空草稿及恢复焦点；主界面清除按钮14px，便签通过样式缩为12px                                                         |
| [BackToList](../src/renderer/src/components/BackToList.tsx)                                                | 共用左箭头与“返回列表”按钮，调用方负责保存后返回                                                                         |
| [DeleteConfirmation](../src/renderer/src/components/DeleteConfirmation.tsx)                                | 基于Radix AlertDialog的应用内确认，使用Button和主题变量；处理取消、Esc、关闭后的焦点恢复，并纳入便签交互保护             |
| [Toast](../src/renderer/src/components/Toast.tsx)、[Toaster](../src/renderer/src/components/ui/sonner.tsx) | Toast将页面消息状态接入Sonner；App挂载提示宿主，默认顶部居中、3秒，便签采用单独偏移并在收起时隐藏                        |
| [CreatedTime](../src/renderer/src/features/shared/CreatedTime.tsx)                                         | 任务、习惯、小记的共用创建时间展示；页面使用`.list-meta`统一第二行样式                                                   |
| TaskCheck、SummaryRing、AppIcon、TaskActionIcon、BrandMark                                                 | 复选框、便签统计、导航／操作图标及品牌标识；TaskCheck保留原生checkbox语义，当前完成视觉为OK字样                          |

Enter提交、Ctrl+Enter换行和输入法保护已经形成共用处理；具体输入是否允许换行、是否失焦保存，仍由业务场景决定。便签继续使用自己的紧凑编辑结构。

## 6. 当下页面样式

### 主界面

- 左侧默认204px导航栏，提供任务、习惯、小记、设置和便签入口；选中状态使用当前主题色。
- 任务页把“这就去做”“持续推进”放入两块低对比、10px圆角的分组容器，组内仍为紧凑列表；归档通过标题下方的切换栏进入。
- 列表描述可以直接编辑，创建时间位于第二行；多天任务保留行内进度与子事项信息。更多菜单使用非模态DropdownMenu，任务详情目前只保留返回与子事项。
- 习惯页提供当前／已归档切换，正文使用ListDescription，周期设置使用Popover＋Select＋ToggleGroup，包含重复规则、星期和时分选择。
- 小记页采用分组导航与列表两栏，默认主题视角；正文直接编辑，主题归集使用带搜索、多选和创建的Popover。主界面已移除详情与补充展示入口。
- 设置按个性化、系统偏好、便签偏好分组，外观选择使用ToggleGroup，开关使用Switch。
- 标题与筛选区域固定，任务／习惯列表及小记分组、内容区管理各自滚动。窄窗口通过CSS调整导航和详情区域。

### 桌面便签

- 顶部工具、底部新增胶囊和双统计环保持固定，中间由[NotePages](../src/renderer/src/features/tasks/NotePages.tsx)在任务／当天小记列表间横向切换。
- 两个列表保持挂载以保留滚动位置，隐藏页使用inert和aria-hidden；切页轨道及分隔线共用过渡。
- 小记列表已支持正文点击原地编辑、归档、当天归档列表、恢复与确认永久删除；这是当前TasksPage中的实现，较早规格中“不编辑正文”的说明已落后。
- 任务行、排序、进度、新增胶囊、双圆环和贴边控件仍使用专用CSS及组件。
- 贴边收起、统计胶囊和便签展开继续由[NoteTransition](../src/renderer/src/features/tasks/NoteTransition.tsx)配合主进程完成；这部分包含原生窗口尺寸与动画握手。
- 多处动效已有减少动态效果适配；新增入口的旋转单独按现有规则保留。

## 7. 与上次整理相比

| 2026-11-02清单中的快照                         | 当前代码                                                   |
| ---------------------------------------------- | ---------------------------------------------------------- |
| 便签仅有小记新增、数量和主界面快捷入口         | 已有任务／当天小记切页、列表、编辑及归档能力               |
| UI接入调研仍称浅色、没有Portal或部分控件待迁移 | 已有浅深色主题、Portal菜单／浮窗、应用内删除确认和Sonner   |
| 三个页面的正文与输入形态分散                   | 已有ListDescription、ClearButton、CreatedTime等共用组件    |
| 习惯设计中周期仍属提案                         | 周期浮窗已在当前业务界面使用，并接入Select、ToggleGroup    |
| 任务列表以开放列表与详情为主                   | 已增加分组容器、归档切换和第二行创建时间，详情收敛为子事项 |

上一份[清理候选清单](./reviews/style-migration-cleanup-2026-11-02.md)作为历史快照保留；本次已重新核对引用并落实下节清理，其余候选仍需结合新代码判断。

## 8. 本次清理与维护边界

- 移除global.css与workbench.css中无引用的旧标题、输入、详情、提示等规则，以及已由Radix接管的input开关和details/summary菜单专属规则。
- 移除旧`.tasks-page.main`布局、小记详情及其响应式样式。任务页仍使用`.workbench-split.has-detail`，对应规则保留；动态生成的便签边缘、动画、分类导航和输入类别规则也继续保留。
- 删除未加载的layout.css、闲置DiagnosticsPage和useDiagnostics，以及仅由该页使用的Icon、StatusBadge。主进程诊断服务、桥接接口和MCP诊断工具保留。
- 开发用A/B/C原型及其DEV入口、历史设计资料继续保留。更新codebase说明，并为接入调研和旧清理清单标明历史记录边界。

继续开发时，沿用现有分工：基础控件放components/ui，业务共用呈现放components或features/shared，主题语义放shared.css及shadcn.css，主界面布局放workbench.css，便签几何与窗口动效保留专用实现。清理依据当前渲染引用与分支，不批量删除仍被继承、由模板字符串生成或用于开发原型的选择器。

## 9. 清理验证

- 共移除105个过时选择器。与改动前工作区快照逐项比较，保留选择器的声明未改变。
- `npm run build`通过，包含TypeScript检查和生产构建。
- `node scripts/run-smoke.mjs appearance`与`note-jottings`的首次操作、重启阶段通过，覆盖浅深色、主题同步及便签小记。
- `node scripts/run-smoke.mjs list-interaction`与`list-metadata`通过，覆盖共用编辑、列表操作、独立滚动区、固定标题和菜单布局。
- 旧`workbench`场景在“未触发页面滚动”断言处失败：脚本向整页追加占位元素并期待页面滚动，当前页面已有固定高度的独立列表滚动区。此次清理保留了相关布局声明；该旧场景仍待随现行交互更新，本轮使用已覆盖当前布局的列表场景完成验证。
