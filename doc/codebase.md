# myTodo codebase结构说明

## 1. 整体结构与各层边界

React通过`renderer/platform/desktop.ts`取得白名单DesktopApi，经preload和Electron IPC访问主进程的同一个AppService。SQLite和本机MCP端点均由主进程持有，不启动额外后端。

| 层                         | 职责                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `renderer/features/tasks/` | 主界面与便签共用任务列表、行内编辑和操作状态                      |
| `renderer/platform/`       | 获取桌面桥接、解析ApiResult                                       |
| `preload/`                 | 固定IPC方法和变更事件订阅；不暴露ipcRenderer                      |
| `main/desktop/`            | 双窗口、托盘、贴边与屏幕恢复、保存握手、IPC来源验证、原生删除确认 |
| `main/core/`               | AppService及TaskStore接口，本地日期、任务输入校验和业务入口       |
| `main/storage/`            | SQLite生命周期、SQL迁移及TaskRepository                           |
| `main/mcp/`                | 官方SDK、本机HTTP端点、鉴权及诊断工具                             |
| `shared/`                  | 纯数据契约和频道名，不导入Electron、React或Node.js                |
| `main/index.ts`            | 组合根，创建共享实例、广播变更和管理生命周期                      |

核心层不导入Electron或MCP SDK。桌面与MCP处理器不编写业务SQL。React不访问文件系统或数据库。

## 2. 源码入口

- `main/index.ts`组装AppDatabase、TaskRepository、AppService、MCP端点和窗口。
- `main/core/app-service.ts`提供今天列表、创建、编辑、完成状态和删除用例；通过可注入时钟确定电脑本地日期。
- `main/core/tasks.ts`定义TaskStore和本地日期转换。
- `main/storage/repositories/tasks.ts`实现持久化与固定创建顺序。
- `main/desktop/window.ts`创建普通主界面与约334px宽、不占任务栏的无标题栏便签。
- `main/desktop/desktop.ts`管理窗口唯一性、唯一托盘、恢复、隐藏及退出前的保存流程。
- `main/desktop/note-controller.ts`管理自由置顶选择与贴边强制置顶、200/600毫秒悬停交互及操作保护。
- `main/desktop/note-geometry.ts`检查屏幕组合的外侧边缘并限制可见位置；屏幕变化由便签控制器恢复。
- `main/desktop/preferences.ts`读写窗口偏好；`save-barrier.ts`按窗口身份关联保存请求与回复。
- `main/desktop/ipc.ts`只接受注册窗口主Frame的请求，校验参数并包装结果；删除调用系统确认框一次，取消不修改数据。
- `preload/index.ts`显式暴露DesktopApi；订阅返回清理函数。
- `renderer/src/features/tasks/TasksPage.tsx`是两端共用的任务界面。
- `renderer/src/features/tasks/useTasks.ts`读取列表、订阅通知、协调操作及错误，丢弃过时列表响应。
- `renderer/src/features/tasks/useTaskInput.ts`串行协调同一轮输入的创建和更新，不阻塞继续输入；任务组件在设置页和收起状态保持挂载。
- `renderer/src/features/settings/SettingsPage.tsx`提供默认置顶及贴边自动隐藏设置。
- `renderer/src/styles/global.css`定义两种布局的共同蓝白样式。

基础设施诊断服务和原验证页源码仍保留，业务首页由TasksPage承担；MCP工具仍只有`app_diagnostics`。

## 3. 启动、窗口与退出

1. 取得数据目录和单实例锁，执行SQLite迁移，创建共享服务。
2. 注册全局IPC和窗口注册表，仅加载便签，然后创建唯一托盘。
3. 每种窗口最多一个；单击托盘恢复便签，右键可打开主界面、隐藏便签或退出。
4. 主界面最小化或关闭、便签关闭均先等待对应窗口保存，再隐藏自身；全部隐藏后继续常驻。
5. 便签顶部空白区通过指针捕获及白名单拖动IPC移动窗口，显示四向移动光标；位置、吸附边缘和设置写入`desktop-settings.json`，兼容旧版位置。图钉只影响本次运行；修改默认置顶立即同步自由置顶选择，贴边仍强制置顶，重启采用设置默认值，恢复贴边时先展开。
   拖动开始时保存并临时固定内容尺寸，移动只更新位置；结束时按原尺寸吸附并恢复尺寸限制，避免Windows分数缩放对外接矩形反复取整导致窗口增长。
6. 贴边仅吸附左、右、上外侧边缘，收起保留可见入口，悬停不抢焦点；托盘主动唤出等待鼠标先进入再离开。显示器或分辨率变化时修正位置，保持主动隐藏状态。
7. 显式退出准备期间同步阻止新的人机输入和新开窗口，再请求两端提交有效输入并等待结果；失败解除输入锁并保留窗口供重试，成功后销毁托盘、移除IPC、关闭MCP和数据库。新唤出意图会使较早的隐藏请求失效。

同一数据目录重复启动会打开或唤出便签。开发数据与安装版数据分开，集成验证使用独立目录。常驻托盘不包含开机自启动。

## 4. 数据库策略

使用`node:sqlite`同步接口，驱动限制在storage层；数据文件开启WAL、外键与busy timeout。迁移在事务中递增执行，失败回滚。

- v1：`app_metadata`基础设施元数据。
- v2：`tasks`业务表，包含自增创建序号、稳定id、任务描述、所属本地日期和完成状态，以及日期/序号索引。
- 查询只返回当天任务并按创建序号排序。编辑与完成不修改日期或序号，删除使用DELETE，更新使用UPDATE，无法恢复已删除任务。
- 不自动清理或延续旧任务；当前没有历史查询入口。
- 诊断仍使用临时表并回滚，不写入持久任务。

## 5. 跨进程契约与同步

`shared/contracts.ts`定义Task、TodayTasks、WindowKind和DesktopApi。所有请求返回`ApiResult<T>`。

| 方法                                           | 作用                                                   |
| ---------------------------------------------- | ------------------------------------------------------ |
| `listToday()`                                  | 返回本地日期和当天任务                                 |
| `createTask(description, expectedDate?)`       | 去除首尾空白，创建未完成任务；可拒绝跨日到达的旧输入   |
| `updateTask(id, description)`                  | 编辑当天任务，拒绝空白                                 |
| `setTaskCompleted(id, completed)`              | 完成或取消完成                                         |
| `deleteTask(id)`                               | 原生确认后删除，返回是否删除                           |
| `openWindow(kind)`                             | 打开或唤出现有窗口                                     |
| `onTasksChanged(listener)`                     | 订阅失效通知，返回取消订阅函数                         |
| `getBootstrap()` / `runDiagnostics()`          | 保留基础设施诊断接口                                   |
| `getWindowState()` / `onWindowState(listener)` | 读取和订阅置顶、贴边及窗口设置                         |
| `updateSettings(settings)` / `toggleNotePin()` | 更新持久偏好或临时置顶状态                             |
| `hideWindow()` / `setInteraction(active)`      | 请求保存后隐藏，或保护输入期间不收起                   |
| `setNoteDragging(active)`                      | 便签头部捕获指针期间由主进程跟随系统鼠标移动窗口       |
| `onSaveRequested(listener)`                    | 生命周期保存握手；preload按请求标识回复，不暴露任意IPC |

成功写入后主进程向所有注册窗口发送`tasks:changed`，界面重新读取同一份数据。每秒检查本地日期变化并广播，窗口聚焦时也刷新；不把日期变更写回旧任务。窗口渲染关闭后台节流，跨日时保持列表更新。新增输入传入所属日期，由共享应用服务在写入前核对本地日期，避免跨日误创建。

## 6. 验证与扩展

- `tests/tasks.test.ts`通过AppService公开接口及真实SQLite验证规则、可控制日期切换、旧任务保留、删除后旧编辑失效和退出重开数据库。
- `tests/storage.test.ts`验证迁移、诊断与凭证，`tests/mcp.test.ts`验证真实SDK与访问限制。
- `scripts/run-smoke.mjs`按首次操作、重启恢复两阶段启动真实Electron；`electron-smoke.mjs`验证无感保存及并发输入、数据库锁失败恢复、双窗口同步、托盘、隐藏、设置、置顶、贴边与重启持久化，并保存截图。
- 系统删除确认框的返回值在集成脚本中模拟；生产代码仍使用Electron原生确认框。
- 屏幕拓扑和鼠标坐标可在操作系统边界替换，真实窗口、React、IPC、SQLite及资源退出不替换；物理设备与Windows外壳验收见[桌面便签验证](./desktop-validation.md)。

新增业务继续按shared契约→storage迁移/仓储→core用例→IPC/preload→renderer的边界推进。MCP业务工具、习惯调度及自启动留待后续。构建输出在`out/`，安装产物在`release/`，验证产物在`.local/smoke/`，均不进入Git。
