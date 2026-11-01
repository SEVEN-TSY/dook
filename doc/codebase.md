# myTodo codebase结构说明

## 1. 整体结构与各层边界

以下源码路径均相对于`src/`。React通过`renderer/platform/desktop.ts`取得白名单DesktopApi，经preload和Electron IPC访问主进程的同一个AppService。SQLite和本机MCP端点均由主进程持有，不启动额外后端。

| 层                         | 职责                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `renderer/features/tasks/` | 主界面与便签共用任务列表、行内编辑和操作状态                      |
| `renderer/platform/`       | 获取桌面桥接、解析ApiResult                                       |
| `preload/`                 | 固定IPC方法和变更事件订阅；不暴露ipcRenderer                      |
| `main/desktop/`            | 双窗口、托盘、贴边与屏幕恢复、保存握手、IPC来源验证、原生删除确认 |
| `main/core/`               | AppService及存储接口，本地日期、任务、子事项、习惯与灵感用例      |
| `main/storage/`            | SQLite生命周期、SQL迁移及任务、习惯、灵感仓储                     |
| `main/mcp/`                | 官方SDK、本机HTTP端点、鉴权及诊断工具                             |
| `shared/`                  | 纯数据契约和频道名，不导入Electron、React或Node.js                |
| `main/index.ts`            | 组合根，创建共享实例、广播变更和管理生命周期                      |

核心层不导入Electron或MCP SDK。桌面与MCP处理器不编写业务SQL。React不访问文件系统或数据库。

## 2. 源码入口

- `main/index.ts`组装AppDatabase、TaskRepository、AppService、MCP端点和窗口。
- `main/core/app-service.ts`提供任务、子事项、习惯和灵感用例；通过可注入时钟确定电脑本地日期。多天任务进度、子事项完成联动与当天可见性沿用同一业务入口。
- `main/core/tasks.ts`定义TaskStore和本地日期转换；习惯及灵感各有独立存储接口，通过AppService的可选features参数注入。
- `main/storage/repositories/tasks.ts`实现任务及子事项持久化；habits仓储以事务写入习惯、任务和每日生成记录，inspirations仓储保存原始想法及按序补充。
- `main/desktop/window.ts`创建普通主界面与约334px宽、不占任务栏的无标题栏便签。
- `main/desktop/desktop.ts`管理窗口唯一性、唯一托盘、恢复、隐藏及退出前的保存流程。
- `main/desktop/note-controller.ts`管理自由置顶选择与贴边强制置顶、即时悬停呼出、600毫秒离开收回交互及操作保护。
- `main/desktop/note-geometry.ts`检查屏幕组合的外侧边缘并限制可见位置；屏幕变化由便签控制器恢复。
- `main/desktop/preferences.ts`读写窗口偏好；`save-barrier.ts`按窗口身份关联保存请求与回复。
- `main/desktop/ipc.ts`只接受注册窗口主Frame的请求，校验参数并包装结果；删除调用系统确认框一次，取消不修改数据。
- `preload/index.ts`显式暴露DesktopApi；订阅返回清理函数。
- `renderer/src/features/tasks/TasksPage.tsx`是两端共用的分类界面；主界面采用左侧任务、习惯、灵感同级导航及底部设置入口，桌面便签以灯泡和数量提供灵感页快捷入口；SubitemsPanel、HabitsPanel和InspirationPanel分别承载子事项、主界面习惯管理及灵感编辑。
- `renderer/src/features/tasks/useTasks.ts`读取列表、订阅通知、协调操作及错误，丢弃过时列表响应。
- `renderer/src/features/tasks/NoteTransition.tsx`以独立共享表面完成胶囊与便签的FLIP投影、圆角校正及内容交接；动画完成后按版本向主进程握手，避免过早收缩原生窗口。
- `renderer/src/features/tasks/useTaskInput.ts`串行协调同一轮输入的创建和更新，不阻塞继续输入；任务组件在设置页和收起状态保持挂载。
- `renderer/src/features/shared/useSerialSave.ts`统一管理草稿串行保存、组合输入延后和失败保留；任务、灵感及子事项各自保留领域校验和持久化动作。
- `renderer/src/features/settings/SettingsPage.tsx`按系统偏好和便签偏好分组，提供开机自启、默认置顶、贴边自动隐藏及显示持续推进设置。隐藏持续推进前由桌面保存屏障提交便签草稿，失败时保持原设置。
- `main/desktop/login-item.ts`通过Electron登录项API应用开机自启偏好，仅Windows安装版注册，开发及集成验证不注册临时程序。
- `renderer/src/styles/global.css`定义两种布局的共同蓝白样式。

基础设施诊断服务和原验证页源码仍保留，业务首页由TasksPage承担；MCP工具仍只有`app_diagnostics`。

## 3. 启动、窗口与退出

1. 取得数据目录和单实例锁，执行SQLite迁移，创建共享服务并补齐当天习惯任务。
2. 注册全局IPC和窗口注册表，仅加载便签，然后创建唯一托盘。
3. 每种窗口最多一个；单击托盘恢复便签，右键可打开主界面、隐藏便签或退出。
4. 主界面最小化或关闭、便签关闭均先等待对应窗口保存，再隐藏自身；全部隐藏后继续常驻。
5. 便签顶部空白区通过指针捕获及白名单拖动IPC移动窗口，显示四向移动光标；位置、吸附边缘和设置写入`desktop-settings.json`，兼容旧版位置。图钉只影响本次运行；修改默认置顶立即同步自由置顶选择，贴边仍强制置顶，重启采用设置默认值，恢复贴边时先展开。
   拖动开始时保存并临时固定内容尺寸，移动只更新位置；结束时按原尺寸吸附并恢复尺寸限制，避免Windows分数缩放对外接矩形反复取整导致窗口增长。
6. 贴边仅吸附左、右、上外侧边缘，收起保留无文字完成比例能量条。悬停呼出仅包含任务完成数和总数的胶囊，不抢焦点；点击展开便签，按住拖动沿当前边缘移动并保存位置。主进程通过拖动结束返回值区分拖动和点击。托盘唤出后恢复自动收回，鼠标不在窗口内时无需先进入，展开动画完成后按离开计时收回；输入编辑保护继续生效。显示器或分辨率变化时修正位置，保持主动隐藏状态。
7. 显式退出准备期间同步阻止新的人机输入和新开窗口，再请求两端提交有效输入并等待结果；失败解除输入锁并保留窗口供重试，成功后销毁托盘、移除IPC、关闭MCP和数据库。新唤出意图会使较早的隐藏请求失效。

同一数据目录重复启动会打开或唤出便签。开发数据与安装版数据分开，集成验证使用独立目录。Windows安装版启动时应用开机自启偏好，首次使用和缺少该字段的旧配置默认开启；设置页修改后立即更新系统登录项并保存偏好。

## 4. 数据库策略

使用`node:sqlite`同步接口，驱动限制在storage层；数据文件开启WAL、外键与busy timeout。迁移在事务中递增执行，失败回滚，已发布迁移不修改。

- v1：`app_metadata`基础设施元数据。
- v2：`tasks`，保留稳定id、任务描述、所属本地日期、完成状态和自增创建顺序。
- v3：任务形态、进度及完成日期；既有任务保持为原日期的今天任务。
- v4：习惯、任务来源及每日生成记录。生成记录独立于任务存活状态，不随任务删除而丢失。
- v5：灵感及按稳定顺序保存的补充内容。
- v6：子事项；首项创建、任务转换及进度更新在同一事务中完成。
- v7：任务排序和置顶；旧任务默认保持创建顺序，分类内置顶优先、再按手动顺序展示。
- v8：习惯任务单次暂停日期；保留任务和生成记录，只从当天列表排除。
- v9～v10：灵感记录时间及主题归集。
- v11：灵感归档状态，旧记录默认保持普通状态。
- v12：任务归档时间及排序索引，旧任务默认未归档。

任务归档独立于完成和习惯暂停状态；日常任务查询及修改均排除归档任务。归档列表按归档时间、创建次序倒序展示，跨日及重启保留。恢复今天任务时归入当天，已完成多天任务的完成日期更新为当天，保留进度和子事项。永久删除级联清理子事项，桌面入口使用一次原生确认。习惯任务只提供暂停一次，不参与归档。

日常列表先返回当天的今天任务，再返回未完成或当天完成的多天任务，各组置顶优先，再按手动顺序展示；尚未排序时保持创建顺序。多天任务完成次日起隐藏，历史数据不自动清理。无子事项时进度由用户调整；有子事项时进度由完成比例计算，整条勾选与子事项在事务中同步。

习惯启动及跨日补齐当天，不补过去日期；习惯与本地日期的唯一生成记录防止重复。当天任务完成、删除或暂停一次后不重建。`skipHabitTask`只允许忽略今天的习惯任务，以skipped_on标记保留原记录，次日照常生成。编辑习惯与当天任务描述在同一事务中更新，保留任务状态及历史记录；删除习惯保留已生成任务和来源。从今天任务添加习惯复用原任务，关联和当天记录原子保存。

灵感独立于任务日期，原始想法和每次补充分开保存。归档记录保留原始内容及主题关联，从普通列表排除；恢复可重新显示，永久删除由数据库级联清理补充和关联。补充输入的一轮保存使用稳定标识追赶连续输入，防止重试产生重复补充。诊断仍使用临时表并回滚，不写入持久业务数据。

## 5. 跨进程契约与同步

`shared/contracts.ts`定义Task、TodayTasks、WindowKind和DesktopApi。所有请求返回`ApiResult<T>`。

| 方法                                           | 作用                                                   |
| ---------------------------------------------- | ------------------------------------------------------ |
| `listToday()`                                  | 返回本地日期、今天任务及可见多天任务                   |
| `createTask(description, expectedDate?)`       | 去除首尾空白，创建未完成任务；可拒绝跨日到达的旧输入   |
| `updateTask(id, description)`                  | 编辑可见任务，拒绝空白                                 |
| `setTaskCompleted(id, completed)`              | 完成或取消完成                                         |
| `deleteTask(id)`                               | 原生确认后删除，返回是否删除                           |
| `listArchivedTasks()` / `archiveTask(id)`        | 查询全部归档任务或直接归档普通任务                     |
| `restoreTask(id)` / `deleteArchivedTask(id)`      | 恢复归档任务，或经原生确认永久删除                     |
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
- `listInspirations`、`createInspiration`、`updateInspiration`、`appendInspiration`读取、编辑及补充灵感。

TasksPage为每个窗口维护唯一的生命周期保存回调，聚合任务、子事项、习惯和灵感草稿；各面板不单独回复同一个保存请求。新增类别切换先保存原类别输入。组合输入未结束或保存失败时返回失败并保留草稿，阻止隐藏或退出。便签编辑和进度交互通过同一个交互状态保护贴边收起。

## 6. 验证与扩展

- `tests/tasks.test.ts`及多天任务、子事项、习惯、灵感回归均通过AppService公开接口与真实SQLite验证行为，覆盖可控日期、事务回滚、旧库兼容、删除和重启恢复。
- `tests/storage.test.ts`验证迁移、诊断与凭证，`tests/mcp.test.ts`验证真实SDK与访问限制。
- `scripts/run-smoke.mjs`按首次操作、重启恢复两阶段启动真实Electron；`electron-smoke.mjs`验证无感保存及并发输入、数据库锁失败恢复、双窗口同步、托盘、隐藏、设置、置顶、贴边与重启持久化，并保存截图。
- 系统删除确认框的返回值在集成脚本中模拟；生产代码仍使用Electron原生确认框。
- 屏幕拓扑和鼠标坐标可在操作系统边界替换，真实窗口、React、IPC、SQLite及资源退出不替换；物理设备与Windows外壳验收见[桌面便签验证](./desktop-validation.md)。

新增业务继续按shared契约→storage迁移/仓储→core用例→IPC/preload→renderer的边界推进。MCP业务工具、自定义类别及未来AI能力留待后续。构建输出在`out/`，安装产物在`release/`，验证产物在`.local/smoke/`，均不进入Git。

Electron分类场景还可分别运行node scripts/run-smoke.mjs multiday和node scripts/run-smoke.mjs subitems，隔离首次操作及重启数据，避免与普通回归中的任务数量断言耦合。

便签的设置和灵感快捷入口通过openWindow的可选MainPage参数定位主界面。DesktopState携带带版本号的mainNavigation，确保主界面首次加载和重复唤出均能接收导航；切页前统一保存已有草稿，失败保留原页。
