# DOOK工程结构说明

应用官方名称为DOOK，源码仓库为`SEVEN-TSY/dook`。Windows应用ID为`com.dook.desktop`，NSIS沿用既有安装的GUID以识别升级。

## 1. 整体结构与各层边界

以下源码路径均相对于`src/`。React通过`renderer/platform/desktop.ts`取得白名单DesktopApi，经preload和Electron IPC访问主进程的同一个AppService。SQLite和本机MCP端点均由主进程持有，不启动额外后端。

| 层                         | 职责                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `renderer/features/tasks/` | 主界面与便签共用任务列表、行内编辑和操作状态                      |
| `renderer/platform/`       | 获取桌面桥接、解析ApiResult                                       |
| `preload/`                 | 固定IPC方法和变更事件订阅；不暴露ipcRenderer                      |
| `main/desktop/`            | 双窗口、托盘、贴边与屏幕恢复、保存握手、IPC来源验证及受控删除入口 |
| `main/core/`               | AppService及存储接口，本地日期、任务、子事项、习惯与小记用例      |
| `main/storage/`            | SQLite生命周期、SQL迁移及任务、习惯、小记仓储                     |
| `main/mcp/`                | 官方SDK、本机HTTP端点、鉴权及诊断工具                             |
| `shared/`                  | 纯数据契约和频道名，不导入Electron、React或Node.js                |
| `main/index.ts`            | 组合根，创建共享实例、广播变更和管理生命周期                      |

核心层不导入Electron或MCP SDK。桌面与MCP处理器不编写业务SQL。React不访问文件系统或数据库。

## 2. 源码入口

- `main/index.ts`组装AppDatabase、TaskRepository、AppService、MCP端点和窗口。
- `main/core/app-service.ts`提供任务、子事项、习惯和小记用例；通过可注入时钟确定电脑本地日期。多天任务进度、子事项完成联动与当天可见性沿用同一业务入口。
- `main/core/tasks.ts`定义TaskStore和本地日期转换；习惯及小记各有独立存储接口，通过AppService的可选features参数注入。
- `main/storage/repositories/tasks.ts`实现任务及子事项持久化；habits仓储以事务写入习惯、任务和每日生成记录，inspirations仓储保存原始想法及按序补充。
- `main/desktop/window.ts`创建隐藏系统标题栏、右上角内嵌原生窗口按钮的主界面与约334px宽、不占任务栏的无标题栏便签。主界面使用titleBarOverlay保留原生最小化、最大化／还原和关闭行为，按钮区域背景透明，让页面及弹窗遮罩自然透出，图标颜色随主题同步；渲染层顶部空白区提供原生拖动区域。
- `main/desktop/desktop.ts`管理窗口唯一性、唯一托盘、恢复、隐藏及退出前的保存流程。
- `main/desktop/note-controller.ts`管理自由置顶选择与贴边强制置顶、即时悬停呼出、600毫秒离开收回交互及操作保护。
- `main/desktop/note-geometry.ts`检查屏幕组合的外侧边缘并限制可见位置；屏幕变化由便签控制器恢复。
- `main/desktop/preferences.ts`读写窗口偏好；`save-barrier.ts`按窗口身份关联保存请求与回复。
- `main/desktop/ipc.ts`只接受注册窗口主Frame的请求，校验参数并包装结果；删除由渲染层共用应用内弹窗确认，再经白名单桥接调用AppService，取消不发起删除。`inspirationTopicDetails`复用已有服务查询主题名称及完整关联数量（含归档小记），用于确认提示。
- `renderer/src/components/BackToList.tsx`统一返回列表按钮，沿用页面的草稿提交及失败保留；`DeleteConfirmation.tsx`使用Radix AlertDialog提供共用应用内确认、取消默认焦点及键盘操作；取消或Esc恢复原操作入口，确认后聚焦稳定的当前页面或任务列表，避免删除行卸载后丢失焦点。TasksPage把两窗口的确认开启状态纳入交互保护，Desktop按窗口合并确认与便签原有输入、拖动等交互状态，最后一个保护结束后恢复自动收起。隐藏或退出仍复用TasksPage每窗口唯一的保存回调：先取消所属窗口的删除确认，再执行原草稿保存，防止隐藏窗口遗留确认保护。
- `preload/index.ts`显式暴露DesktopApi；订阅返回清理函数。
- `renderer/src/features/tasks/TasksPage.tsx`是两端共用的分类界面；主界面采用左侧任务、习惯、小记同级导航及底部设置入口，三个类别均订阅变更并显示当天数量：当天可见任务、当天习惯任务、当天新增小记；两端共用已归档任务列表，“显示持续推进”同时控制两端可见性与统计。桌面便签以灯泡和当天数量提供小记页快捷入口；SubitemsPanel、HabitsPanel和InspirationPanel分别承载子事项、主界面习惯管理及小记编辑。
- `renderer/src/features/tasks/useTasks.ts`读取列表、订阅通知、协调操作及错误，丢弃过时列表响应。
- `renderer/src/features/tasks/NoteTransition.tsx`以独立共享表面完成胶囊与便签的FLIP投影、圆角校正及内容交接；动画完成后按版本向主进程握手，避免过早收缩原生窗口。
  悬停呼出胶囊和从托盘展开贴边便签共用`finishEdgePreparation`交接。渲染层先在原窗口内绘制隐藏帧，再按版本确认，主进程收到确认后才放大窗口。
- `renderer/src/features/tasks/useTaskInput.ts`串行协调同一轮输入的创建和更新，不阻塞继续输入；任务组件在设置页和收起状态保持挂载。
- `renderer/src/features/shared/useSerialSave.ts`统一管理草稿串行保存、组合输入延后和失败保留；任务、小记及子事项各自保留领域校验和持久化动作。
- `renderer/src/features/settings/SettingsPage.tsx`按个性化、系统偏好和便签偏好分组，提供浅深色外观、主题色、开机自启、默认置顶、贴边自动隐藏及显示持续推进设置。隐藏持续推进前由桌面保存屏障提交便签草稿，失败时保持原设置。
- `main/desktop/login-item.ts`通过Electron登录项API应用开机自启偏好，仅Windows安装版注册，开发及集成验证不注册临时程序。
- `renderer/src/styles/`由main.tsx依次加载shared.css、global.css、workbench.css和shadcn.css：分别维护共用主题与基础组件、便签及窗口交互、主界面布局和业务呈现、Tailwind入口及UI组件语义颜色。基础控件使用本地components/ui及Radix，正文编辑和新增输入使用features/shared共用组件；完整分工见[UI框架与样式结构](../docs/ui-framework-and-styles.md)。

业务首页由TasksPage承担；旧工程验证页及专属布局、图标、状态徽章已移除。基础设施诊断服务、桥接接口和`app_diagnostics`MCP工具继续保留。

## 3. 启动、窗口与退出

1. 取得数据目录和单实例锁，执行SQLite迁移，创建共享服务并补齐当天习惯任务。
2. 注册全局IPC和窗口注册表，仅加载便签，然后创建唯一托盘。
3. 每种窗口最多一个；单击托盘恢复便签，右键可打开主界面、隐藏便签或退出。
4. 主界面最小化或关闭、便签关闭均先等待对应窗口保存，再隐藏自身；全部隐藏后继续常驻。
5. 便签顶部空白区通过指针捕获及白名单拖动IPC移动窗口，显示四向移动光标；位置、吸附边缘和设置写入`desktop-settings.json`，兼容旧版位置。图钉只影响本次运行；修改默认置顶立即同步自由置顶选择，贴边仍强制置顶，重启采用设置默认值，恢复贴边时先展开。
   拖动开始时保存并临时固定内容尺寸，移动只更新位置；结束时按原尺寸吸附并恢复尺寸限制，避免Windows分数缩放对外接矩形反复取整导致窗口增长。
6. 贴边仅吸附左、右、上外侧边缘，收起保留无文字完成比例能量条。悬停呼出仅包含任务完成数和总数的胶囊，不抢焦点；点击展开便签，按住拖动沿当前边缘移动并保存位置。主进程通过拖动结束返回值区分拖动和点击。单击托盘唤出后，从便签完全展开起至少停留2.5秒。鼠标在窗口外且无交互保护时可自动收回，无需先进入。显示器或分辨率变化时修正位置，保持主动隐藏状态。
7. 显式退出准备期间同步阻止新的人机输入和新开窗口，再请求两端提交有效输入并等待结果；失败解除输入锁并保留窗口供重试，成功后销毁托盘、移除IPC、关闭MCP和数据库。新唤出意图会使较早的隐藏请求失效。

同一数据目录重复启动会打开或唤出便签。开发数据与安装版数据分开，集成验证使用独立目录。Windows安装版启动时应用开机自启偏好，首次使用和缺少该字段的旧配置默认开启；设置页修改后立即更新系统登录项并保存偏好。

## 4. 数据库策略

v18为inspirations增加可空archived_at；归档经AppService核心时钟写入，恢复时清空，分页契约通过archivedAt带回。旧归档记录保持NULL，界面显示未知；created_at不受归档及恢复影响。

v19为habits增加可空archived_at，沿用小记的记录及清空规则。习惯归档时间与移除当天任务在同一事务中提交；listArchivedHabits返回archivedAt，界面用图标展示归档与创建时间。

v20将数据库的应用元数据更新为`dook`。首次使用新目录时，在单实例锁内用SQLite备份接口导入旧库，同时复制缺失的窗口设置和MCP凭证。数据库文件最后就位，已有`dook.sqlite`时直接使用该库。旧文件作为备份保留。

SQLite驱动限制在storage层，业务读写使用`node:sqlite`同步接口。数据文件开启WAL、外键与busy timeout。迁移在事务中递增执行，失败回滚，已发布迁移不修改。

- v1：`app_metadata`基础设施元数据。
- v2：`tasks`，保留稳定id、任务描述、所属本地日期、完成状态和自增创建顺序。
- v3：任务形态、进度及完成日期；既有任务保持为原日期的今天任务。
- v4：习惯、任务来源及每日生成记录。生成记录独立于任务存活状态，不随任务删除而丢失。
- v5：小记及按稳定顺序保存的补充内容。
- v6：子事项；首项创建、任务转换及进度更新在同一事务中完成。
- v7：任务排序和置顶；旧任务默认保持创建顺序，分类内置顶优先、再按手动顺序展示。
- v8：习惯任务单次暂停日期；保留任务和生成记录，只从当天列表排除。
- v9～v10：小记记录时间及主题归集。
- v11：小记归档状态，旧记录默认保持普通状态。
- v12：任务归档时间及排序索引，旧任务默认未归档。

任务归档独立于完成和习惯暂停状态；日常任务查询及修改均排除归档任务。归档列表按归档时间、创建次序倒序展示，跨日及重启保留。恢复今天任务时归入当天，已完成多天任务的完成日期更新为当天，保留进度和子事项。永久删除级联清理子事项，桌面入口使用一次应用内确认并说明无法恢复。习惯任务只提供暂停一次，不参与归档。

日常列表先返回当天的今天任务，再返回未完成或当天完成的多天任务，各组置顶优先，再按手动顺序展示；既有任务顺序保留，新建任务通过同一INSERT写入当前普通今天任务最小排序值之前，置顶和手动排序优先级保持不变。多天任务完成次日起隐藏，历史数据不自动清理。无子事项时进度由用户调整；有子事项时进度由完成比例计算，整条勾选与子事项在事务中同步。

习惯启动及跨日补齐当天，不补过去日期；习惯与本地日期的唯一生成记录防止重复。当天任务完成、删除或暂停一次后不重建。`skipHabitTask`只允许忽略今天的习惯任务，以skipped_on标记保留原记录，次日照常生成。编辑习惯与当天任务描述在同一事务中更新，保留任务状态及历史记录；删除习惯与其当天任务在同一事务中完成，以核心层本地日期为准，包含当天已完成和已暂停的任务，保留历史任务和来源。从今天任务添加习惯复用原任务，关联和当天记录原子保存。

小记独立于任务日期，原始想法和每次补充分开保存。归档记录保留原始内容及主题关联，从普通列表排除；恢复可重新显示，永久删除由数据库级联清理补充和关联。补充输入的一轮保存使用稳定标识追赶连续输入，防止重试产生重复补充。诊断仍使用临时表并回滚，不写入持久业务数据。

## 5. 跨进程契约与同步

`shared/contracts.ts`定义Task、TodayTasks、WindowKind和DesktopApi。所有请求返回`ApiResult<T>`。

| 方法                                           | 作用                                                   |
| ---------------------------------------------- | ------------------------------------------------------ |
| `listToday()`                                  | 返回本地日期、今天任务及可见多天任务                   |
| `createTask(description, expectedDate?)`       | 去除首尾空白，创建未完成任务；可拒绝跨日到达的旧输入   |
| `updateTask(id, description)`                  | 编辑可见任务，拒绝空白                                 |
| `setTaskCompleted(id, completed)`              | 完成或取消完成                                         |
| `deleteTask(id)`                               | 界面确认后经受控桥接删除，返回是否删除                 |
| `listArchivedTasks()` / `archiveTask(id)`        | 查询全部归档任务或直接归档普通任务                     |
| `restoreTask(id)` / `deleteArchivedTask(id)`      | 恢复归档任务，或界面确认后永久删除                     |
| `openWindow(kind, page?)`                             | 打开或唤出现有窗口，可定位主界面页面                   |
| `onTasksChanged(listener)`                     | 订阅失效通知，返回取消订阅函数                         |
| `getBootstrap()` / `runDiagnostics()`          | 保留基础设施诊断接口                                   |
| `getWindowState()` / `onWindowState(listener)` | 读取和订阅置顶、贴边及窗口设置                         |
| `updateSettings(settings)` / `toggleNotePin()` | 更新持久偏好或临时置顶状态                             |
| `hideWindow()` / `setInteraction(active)`      | 请求保存后隐藏，或保护输入期间不收起                   |
| `setNoteDragging(active)`                      | 头部自由拖动或收起入口沿边拖动；返回是否发生沿边拖动       |
| `finishNoteMotion(revision)`                  | 当前便签完成视觉交接后确认版本，再由主进程结束窗口过渡 |
| `onSaveRequested(listener)`                    | 生命周期保存握手；preload按请求标识回复，不暴露任意IPC |

成功写入后主进程向所有注册窗口发送`tasks:changed`，界面重新读取同一份数据。每秒检查本地日期变化，由主进程补齐当天习惯任务后广播；失败保留日期检查点供重试。窗口聚焦时也刷新，不把日期变更写回旧任务。窗口渲染关闭后台节流，跨日时保持列表更新。新增输入传入所属日期，由共享应用服务在写入前核对本地日期，避免跨日误创建。

分类API同样通过白名单DesktopApi、IPC来源验证及ApiResult传递，不暴露任意频道或SQL：

- `setTaskPinned`、`moveTask`处理分类内置顶与排序，同一事务校验当前可见任务，禁止跨分类或跨置顶分区拖动。
- `convertToMultiDay`、`setTaskProgress`处理任务转换和手动进度。
- `addSubitem`、`updateSubitem`、`setSubitemCompleted`、`deleteSubitem`维护子事项。
- `listHabits`、`createHabit`、`createHabitFromTask`、`updateHabit`、`deleteHabit`管理习惯；`ensureDailyTasks`由主进程调度。
- `listInspirations`、`createInspiration`、`updateInspiration`、`appendInspiration`读取、编辑及补充小记。

TasksPage为每个窗口维护唯一的生命周期保存回调，聚合任务、子事项、习惯和小记草稿；各面板不单独回复同一个保存请求。便签新增任务与小记仅由键盘Enter显式提交，不参与自动保存；切换类别及收起保留各自草稿，输入法组合期间不切换类别。组合输入未结束或保存失败时返回失败并保留草稿，阻止隐藏或退出。便签编辑和进度交互通过同一个交互状态保护贴边收起。

## 6. 验证与扩展

主题归集Popover独立于分页行的生命周期，使用当前行按钮作为虚拟锚点；行因即时归集退出分组时保持操作会话，分组查询仍立即刷新。主题写入继续串行经过DesktopApi及AppService；会话和草稿版本阻止较早异步结果关闭或清空新输入。浮层打开时复用listInspirations读取当前记录的最新主题关联，跨窗口通知同时刷新浮层与分页列表。`node scripts/run-smoke.mjs topic-refinement`覆盖主题入口、外部取消、连续多选、失败保留、过时结果保护及双窗口和重启持久化。

- `tests/tasks.test.ts`及多天任务、子事项、习惯、小记回归均通过AppService公开接口与真实SQLite验证行为，覆盖可控日期、事务回滚、旧库兼容、删除和重启恢复。
- `tests/storage.test.ts`验证迁移、诊断与凭证，`tests/mcp.test.ts`验证真实SDK与访问限制。
- `scripts/run-smoke.mjs`按首次操作、重启恢复两阶段启动真实Electron；`electron-smoke.mjs`验证无感保存及并发输入、数据库锁失败恢复、双窗口同步、托盘、隐藏、设置、置顶、贴边与重启持久化，并保存截图。
- 删除验证操作真实应用内确认按钮，覆盖取消、确认、失败、主题关联数量、归档永久删除及便签保护。`node scripts/run-smoke.mjs delete-confirmation`复用真实Electron→桥接→AppService→SQLite链路；返回失败使用隔离数据库触发器，窗口保存／退出失败的系统错误提示仍可在操作系统边界模拟。
- 屏幕拓扑和鼠标坐标可在操作系统边界替换，真实窗口、React、IPC、SQLite及资源退出不替换；物理设备与Windows外壳验收见[桌面便签验证](./desktop-validation.md)。

新增业务继续按shared契约→storage迁移/仓储→core用例→IPC/preload→renderer的边界推进。MCP业务工具、自定义类别及未来AI能力留待后续。构建输出在`out/`，安装产物在`release/`，验证产物在`.local/smoke/`，均不进入Git。

Electron分类场景还可分别运行node scripts/run-smoke.mjs multiday和node scripts/run-smoke.mjs subitems，隔离首次操作及重启数据，避免与普通回归中的任务数量断言耦合。

便签的设置和小记快捷入口通过openWindow的可选MainPage参数定位主界面。DesktopState携带带版本号的mainNavigation，确保主界面首次加载和重复唤出均能接收导航；切页前统一保存已有草稿，失败保留原页。

## 小记界面细节

`renderer/src/features/inspirations/InspirationPanel.tsx`只承载分组导航、分页列表、正文原地编辑和主题归集；默认主题视角及无归类。主题和日期在组件生命周期内各自保留分组、加载页数及滚动位置，重启不恢复浏览位置，不再维护详情选中状态。

普通与已归档小记不渲染详情、历史补充或追加入口。`appendInspiration`、仓储及已有补充数据继续保留，领域仍支持持续补充。新增与原地编辑沿用`useInspirationInput`及`useSerialSave`；`InlineComposer`统一任务、习惯及小记新增表面，默认通过`onValueChange`清除草稿；与`ClearableInput`、`ClearableTextarea`共用`ClearButton`及透明清除样式，保留焦点且不提交。`ClearableTextarea`提供正文清除及输入区域内部焦点移动保护，正文编辑随内容增高，列表单行省略。

便签的任务和小记继续共用`TasksPage.tsx`的单行`ClearableInput`及展开／收起流程；加号旋转成叉号控制收起，键盘Enter显式提交，占位文字提示“写下任务，回车保存”或“写下小记，回车保存”，收起和失焦保留未提交草稿。`node scripts/run-smoke.mjs inspiration-page`通过真实双窗口和SQLite验证输入、分页、两视角位置、双窗口同步及重启默认分组，并保留普通和窄窗口截图。


主界面任务和小记正文复用`features/shared/ListDescription.tsx`及`main-list-*`样式，统一省略展示、原地编辑、焦点、清除及键盘提交；便签不接入此组件。主界面任务及便签任务、小记的新增草稿不参与自动保存，仅显式提交；已有正文编辑继续参与生命周期保存。`node scripts/run-smoke.mjs list-interaction`覆盖两端排序、主界面显式提交、共用编辑和便签长文本末尾可见性。

## 外观与便签小记页面

2026-11-03更新：TasksPage通过独立useInspirationInput维护便签小记编辑草稿，将正文编辑渲染传给NotePages；复用串行保存、生命周期保存屏障和贴边交互保护。未归档小记可点击正文编辑，归档小记继续只读，替代下方仅提供归档的旧描述。任务及子事项共用TaskCheck的OK选中标记，主题归集checkbox继续使用原勾选样式。

Desktop读取持久外观三态并协调Electron nativeTheme，监听系统变化后广播解析出的colorScheme；渲染入口按系统偏好初始化，再由窗口状态同步最终外观。CSS的light-dark颜色角色保留浅色值并统一适配黑灰外观，主题色仍独立设置。

NotePages使任务和当天小记列表保持挂载，通过横向轨道切页并各自保留滚动位置；非活动页使用inert和aria-hidden退出操作序列。TasksPage沿用现有查询与归档入口，按本地日期筛选并按记录时间倒序呈现，只提供归档。类别切换先通过保存屏障，版本标识阻止较早保存结果覆盖最近的切页意图。小记模型、数据表及业务接口保持。

`node scripts/run-smoke.mjs appearance`验证外观跟随、固定模式、同步及重启；`node scripts/run-smoke.mjs note-jottings`验证当天范围、归档、长列表、输入保护、跨日及横向切页，并保存浅深色截图。

便签小记的已归档分组通过现有listInspirationPage的archive查询读取分页，按首次记录的本地日期筛选今天内容，复用变更广播刷新计数和内容。NotePages保留独立折叠状态，恢复和永久删除由TasksPage沿用保存屏障、共用删除确认及现有API处理；日常列表和数量仍只统计当天未归档小记。

习惯归档通过HabitStore、AppService及白名单IPC串联；habits.archived持久化状态，每日生成仅遍历未归档习惯。归档事务移除当天任务，恢复事务重新生成当天任务，永久删除仅允许归档习惯且保留历史任务。

## 列表创建时间与归档入口

便签任务归档通过Task的可选archivedAt读取既有archived_at，以本地今天筛选行与数量；主界面继续显示全部归档。恢复后的任务不携带归档时间，无需数据库迁移。NoteEmpty统一便签任务与小记的空页面，新增按钮展开并聚焦当前类别的底部输入。DOOK图标统一引用resources/dook-wordmark-v2-straight.svg，通过CSS mask读取轮廓，以currentColor填充主题色；页面不再内嵌路径，PNG仅用于导出保存。

v14为tasks、habits追加可空created_at。AppService通过同一次核心时钟读数传入本地日期及ISO创建时间，仓储覆盖普通创建、从任务建立习惯和每日任务生成；读取及更新结果带回createdAt，旧记录保留null。编辑、转换、归档与恢复不改写原创建时间。

主界面通过共享CreatedTime及纯函数shared/created-time.ts统一列表第二行格式。TasksPage持有任务与习惯的独立归档筛选状态，标题下方靠左的“全部／已归档”标签栏切换普通与仅归档视图，HabitsPanel接收筛选状态；便签继续使用折叠分组。任务DropdownMenu关闭模态滚动锁定，保留原布局与滚动位置。`node scripts/run-smoke.mjs list-metadata`覆盖菜单几何稳定、进度条可见、时间展示及归档筛选。

任务与习惯页的workbench-main-list-page采用视口高度的列布局，标题及筛选栏固定占位，workbench-split和workbench-habit-page分别承载剩余空间内的独立滚动；根页面不滚动。

主界面普通任务按noteGroups分别渲染task-card-group，两个卡组共享原有任务行与操作逻辑，不再使用首个多天任务行上的绝对定位组标题；便签分组维持原有实现。

## 习惯定时周期

v15为habits增加可空schedule JSON；旧记录不设置周期，沿用每日生成。HabitSchedule通过DesktopApi.setHabitSchedule、固定IPC及AppService传递，核心层验证周期、星期和时间；仓储以事务更新周期及生成当前到期任务。habit-schedule.ts按本地时间及日历日期判断每天、每周与间隔周期；间隔日差使用UTC日期避免夏令时日长变化。现有habit_generations保证单日唯一，不补历史。

主进程保留每秒时钟检查，仅在分钟变化时调用ensureDailyTasks；生成失败不推进检查点，下秒重试。跨日或新任务生成后广播；启动仍检查当天到期任务。恢复习惯同样经过周期判断。

HabitSchedulePopover复用现有Popover及箭头、关闭入口，使用236px宽紧凑浮窗。HabitsPanel将当前与归档数量向TasksPage同步；正文编辑保留，移除独立编辑按钮。tests/habit-schedule.test.ts覆盖生成时间、星期、间隔、重启、单日去重、无效输入与事务回滚；habit-archive smoke覆盖实际浮窗保存、失败保留、取消、数量同步和归档恢复。

习惯界面将既有archived状态呈现为“活跃／已暂停”，保留存储及桥接名称。桌面listHabits调用AppService.listHabitOverview，结合核心时钟、周期和habit_generations计算nextExecutionAt，不另存下一次时间。已生成当天的习惯跳过当天；到期尚未生成的计划按当前时间待执行。界面每分钟、窗口聚焦及业务变更时刷新，第二行显示下一次执行和调度摘要，暂停时显示状态及原周期。
