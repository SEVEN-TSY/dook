# shadcn/ui接入与样式边界

2026-11-03将早期调研和分阶段实施记录收敛为当前接入决定。完整组件及页面现状见[UI框架与样式结构](../ui-framework-and-styles.md)，视觉要求见[主界面设计语言](../../doc/design-language.md)和[UI风格规范](../../doc/ui-style-guide.md)。

## 已接入的基础

- React与TypeScript继续负责渲染层，Electron主进程、DesktopApi、保存机制和业务规则保持原有边界。
- renderer使用`@tailwindcss/vite`；`@/`指向`src/renderer/src`，TypeScript同步配置。
- `components.json`配置new-york、slate、CSS变量及Lucide。组件源码位于`components/ui/`，可直接按项目需求修改，保留原许可。
- Button、Input、Switch、DropdownMenu、Popover、Select、ToggleGroup参与现行业务；删除确认直接使用Radix AlertDialog；Sonner承载两窗口的操作提示。
- ListDescription、InlineComposer、ClearButton、BackToList、CreatedTime等项目组件统一业务呈现和输入行为；独立Textarea源码仍保留，当前正文编辑使用定制textarea。

## CSS与主题决定

入口依次加载shared.css、global.css、workbench.css、shadcn.css，具体职责见结构说明。

1. Tailwind只导入theme和utilities，省略Preflight，避免基础重置影响透明便签及窗口几何；框架控件需要的边框等基础规则通过data-slot补齐。
2. utilities采用important导入，与当前未分层的页面CSS共存。改造时复用组件变体和语义变量，清理失去用途的旧选择器，避免继续叠加高优先级覆盖。
3. `--app-*`作为共用主题来源，框架语义颜色由shadcn.css映射。主题色与浅深色同步两窗口；`.dark`处理框架变体，`color-scheme`及`light-dark()`处理项目颜色。
4. 主界面布局主要位于`.workbench`内，便签几何主要位于`.note`内；四个CSS仍由两个窗口共同加载，全局规则及data-slot修正需要考虑两端。

## Portal与窗口交互

DropdownMenu、Popover、Select和AlertDialog已使用Portal。主题变量位于根节点，主界面部分浮窗规则使用`html[data-window='main']`限定，不依赖浮层位于.workbench内部。

任务菜单采用非模态DropdownMenu，避免滚动锁定引起尺寸与位置变化。主题归集Popover使用当前按钮的虚拟锚点，操作会话独立于分页行；即时归集导致行移出时，浮层仍可继续整理当前记录。习惯周期复用Popover，并使用Select及ToggleGroup选择规则、星期和时间。

删除确认纳入便签交互保护，取消、确认和隐藏时处理焦点及保护释放。业务草稿继续由既有串行保存和每窗口保存屏障协调，基础控件不维护第二套业务状态。

## 清理结果与保留边界

已清理旧input开关、details/summary菜单、旧任务及小记详情样式、无引用的输入和标题规则、工程验证页及专属布局。A/B/C探索原型、DEV动态入口和npm命令也已移除，清理前源码保存在提交23787fe中。

早期审美候选和旧主界面图见[历史归档](../archive/README.md)。便签贴边、统计环、输入胶囊、列表切页、FLIP投影和原生窗口握手继续使用专用组件及CSS。

## 验证入口

- `npm run build`：类型检查及生产构建。
- `node scripts/run-smoke.mjs workbench`：工作台导航、输入、菜单、详情、小记分组与滚动。
- `list-interaction`、`list-metadata`：共用正文编辑、列表布局、创建时间和滚动稳定性。
- `appearance`、`note-jottings`：浅深色、主题与便签小记的首次操作及重启。

实际执行结果记录于[清理清单](../reviews/style-migration-cleanup-2026-11-02.md)。新增组件时沿用这些现有入口，按实际影响选择验证范围。
