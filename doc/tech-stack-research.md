# DOOK技术栈选型调研

调研日期：2026-10-27。状态：用户已确定采用方案B（Electron），尚未搭建应用或实测性能。Tauri相关内容保留为比较资料。

比较对象：

- 方案A：Tauri＋React＋TypeScript＋Rust＋SQLite。
- 方案B：Electron＋React＋TypeScript＋SQLite，本机后端使用Node.js＋TypeScript。

依据为本仓库[需求文档](./todo.md)及当前讨论：Windows开机自启动、长期托盘驻留、快速打开、贴边隐藏、本地任务与习惯管理、供Agent读写的MCP接口。用户已学过Java和JavaScript，没学过Rust；尚未确认TypeScript经验。本文区分官方能力、外部测量和针对本项目的设计建议；仅引用官方文档、源码和测量作者自己的报告。

## 1. 已确定的选型与依据

**用户已确定采用Electron＋React＋TypeScript＋SQLite，本机后端使用Node.js＋TypeScript。**该方案可以利用已有JavaScript基础，统一界面、业务规则与MCP的主要开发语言，降低接手与维护成本；轻量常驻、开机自启动和快速唤出仍然是实现目标。Tauri可以利用系统WebView缩小发行体积，但这不构成对更低常驻内存或更快启动的保证，不作为当前实现方案。[Tauri进程模型](https://v2.tauri.app/concept/process-model/)、[Electron进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)

以下保留两套方案的取舍依据，当前按方案B推进：

| 条件 | 建议 |
|---|---|
| 愿意由Agent承担主要Rust开发维护，同时接受自己逐步了解Rust代码 | 优先试方案A |
| 希望自己容易接手整套代码，利用已有JavaScript基础 | 优先考虑方案B，按需要学习TypeScript |
| 单纯要求Windows常驻时更省内存、更快唤出 | 目前证据不足以决定，需要同机、同功能测量 |
| 将来Tauri原型在完整进程内存或唤出速度上未达到目标，Rust维护又明显增加负担 | 转向方案B，或重新评估窗口保留策略 |

Electron依旧需要处理主进程、界面进程和进程通信，不能等同于普通网页项目。[Electron进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)

## 2. 体积、内存和速度分别判断

### 2.1 安装体积：Tauri的优势有明确结构依据

Tauri在Windows上调用WebView2；Electron把Chromium和Node.js随应用一起分发。两者都能显示React界面，分发浏览器运行时的方式不同。[Tauri进程模型](https://v2.tauri.app/concept/process-model/)、[Electron框架说明](https://www.electronjs.org/docs/latest/tutorial/tutorial-prerequisites)

微软说明Windows 11包含Evergreen WebView2，大多数Windows 10设备也已有安装，但仍应检测缺失情况。在线引导安装器需要下载运行时；离线分发需带完整运行时。若改为捆绑Fixed Version，微软说明其二进制超过250MB，不能继续套用极小安装包的数字。[微软WebView2分发说明](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)

**若采用方案A：**优先使用系统Evergreen WebView2，安装包处理缺失检测；报告同时记录“应用安装包”和“缺少运行时情况下的首次安装下载量”，避免混淆。

### 2.2 公开测量只能作为案例

Dawloom作者在一台Windows 11笔记本上，用相同的800×600计数器HTML窗口比较了Tauri和Electron。报告列出的环境为i7-1185G7、32GB内存、NVMe SSD，Tauri 2.12.3和Electron 44.4.5，2026-10-13至14日测量：

| 指标 | Tauri | Electron |
|---|---:|---:|
| NSIS安装包 | 1.05MB | 106.1MB |
| 安装后应用文件 | 3.00MB | 367.40MB |
| 空闲私有内存，计入全部子进程 | 142MB | 149MB |

内存是在启动15秒后测量，Tauri取5次中位数，Electron只有1次。作者未发布启动时间，因为测试时CPU存在其他构建负载。这是极简窗口的外部测量，尚未独立复现；不包含本项目的SQLite、任务列表、MCP和贴边逻辑，不能作为DOOK的预算或性能承诺。[测量作者的原文、代码与方法](https://dawloom.com/blog/tauri-vs-electron-vs-wpf-benchmark/)

### 2.3 常驻与快速打开存在窗口策略取舍

Tauri的隐藏接口改变窗口可见性；Electron也允许创建隐藏窗口。窗口隐藏与窗口销毁是不同操作，因此不能把“进入托盘”直接等同于“释放界面运行时”。[Tauri窗口接口](https://v2.tauri.app/reference/javascript/api/namespacewindow/)、[Electron窗口接口](https://www.electronjs.org/docs/latest/api/browser-window)

**本项目建议：**先保留一个隐藏主窗口，以托盘唤出体验为优先；若内存不合适，再比较“只留核心进程，唤出时创建窗口”。两种策略都应测量，不预先承诺哪种资源占用更优。开机登录到托盘就绪、首次显示界面、后台唤出是三个独立指标。界面优先展示本地数据，AI分析延后按需触发。

## 3. Windows桌面需求是否覆盖

| 需求 | 方案A | 方案B |
|---|---|---|
| 托盘与菜单 | 官方Tray能力，可注册点击和菜单事件。[文档](https://v2.tauri.app/learn/system-tray/) | 内置Tray模块。[文档](https://www.electronjs.org/docs/latest/api/tray) |
| 开机自启动 | 官方autostart插件可启用、关闭并传启动参数。[文档](https://v2.tauri.app/plugin/autostart/) | `app.setLoginItemSettings`支持Windows登录启动和参数。[文档](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows) |
| 重复打开时唤出已有窗口 | single-instance插件提供回调；默认不会替应用完成显示和聚焦。[文档](https://v2.tauri.app/plugin/single-instance/) | `requestSingleInstanceLock`配合`second-instance`处理。[文档](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata) |
| 关闭按钮进入托盘 | 在应用里拦截关闭并隐藏，需要区分“关闭窗口”和“退出程序”。[窗口接口](https://v2.tauri.app/reference/javascript/api/namespacewindow/) | 在应用里处理关闭/退出事件并隐藏窗口。[生命周期](https://www.electronjs.org/docs/latest/api/app) |
| 贴边隐藏 | 有位置、移动事件、显示与隐藏等基础能力。[窗口接口](https://v2.tauri.app/reference/javascript/api/namespacewindow/) | 有窗口控制、显示器和鼠标位置能力。[窗口](https://www.electronjs.org/docs/latest/api/browser-window)、[screen](https://www.electronjs.org/docs/latest/api/screen) |

**实施判断：**两栈都能实现上述功能，贴边隐藏需要自行编写状态逻辑。需要处理多显示器、缩放比例、任务栏工作区、鼠标唤出区域和弹窗焦点；“移出屏幕”本身不能覆盖完整交互。优先采用事件驱动；确实需要检测鼠标时，仅在贴边状态启用低频检查，避免全程高频轮询。

**建议行为：**登录启动带`--background`，进入托盘；用户手动打开则显示主窗口；重复打开唤出已有实例。自启动接口提供登记能力，隐藏启动的具体行为由应用实现。所有开关集中放在需求中约定的设置页。

## 4. 开发与维护成本

Tauri的Windows开发需要Rust工具链、Microsoft C++ Build Tools和WebView2；React/TypeScript前端还需要Node.js相关构建工具。Electron基础开发使用Node.js/npm；如果选用了原生Node模块，仍可能需要本机构建工具和针对Electron的重新编译。[Tauri环境要求](https://v2.tauri.app/start/prerequisites/)、[Electron环境要求](https://www.electronjs.org/docs/latest/tutorial/tutorial-prerequisites)、[原生Node模块说明](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)

本次本机只读检查发现Node v24.15.0以及npm、pnpm可用；当前PowerShell的PATH未找到`rustc`、`cargo`和`cl`。这只说明这些命令当前不可直接调用，不能据此断定电脑没有安装Visual Studio Build Tools。尚未安装或修改任何环境。

| 维护问题 | 方案A | 方案B |
|---|---|---|
| 主要业务代码 | Rust，需要理解类型、所有权及异步/线程调用 | TypeScript，界面和后端可共享部分类型与校验代码 |
| 构建依赖 | npm/pnpm和Cargo两套依赖、两类报错 | 以npm/pnpm为主，原生SQLite驱动仍有ABI与打包问题 |
| 切换成本 | React视图可保留；Rust业务和桌面适配需要重写 | React视图可保留；TypeScript后端迁往Rust需要重写 |

以上是基于语言与进程分工的维护判断。不能把“由Agent编写”当作消除Rust维护成本的保证，也不能假定用户目前已熟悉TypeScript。

**前端建议：**React＋TypeScript＋Vite，本地静态界面即可；当前需求没有SSR或独立Web后端的必要。Tauri官方有Vite集成，Electron的渲染进程也使用Web界面；视图尽量通过少量应用调用接口访问本机能力，避免散布框架专属调用。[Tauri Vite集成](https://v2.tauri.app/start/frontend/vite/)、[Electron渲染进程](https://www.electronjs.org/docs/latest/tutorial/process-model)

## 5. SQLite的具体落地方式

SQLite允许同进程或跨进程的多个连接，但同一时刻只有一个写入者。WAL支持读写并行，不会变成多个同时写入者。[SQLite隔离说明](https://sqlite.org/isolation.html)、[WAL说明](https://sqlite.org/wal.html)

**两栈共同建议：**本机业务模块统一处理写入；界面和MCP调用同一套“创建任务、添加子事项、调整进度”等操作，提交事务后通知界面刷新。“单一业务写入入口”是为了简化本项目规则和状态同步，并非SQLite限制只能有一个客户端。

例如，给今天任务添加子事项，必须在同一事务中完成类型转换和子事项新增。每天生成习惯任务按“习惯ID＋本地日期”去重，并在启动、跨日和休眠恢复时补偿检查；避免依赖隐藏网页中的计时器。以上均为针对需求的实现建议。

- **方案A：**优先使用Rust的`rusqlite`，开启`bundled`便于随应用编译SQLite；数据库连接由一个后台worker管理，避免同步SQL阻塞界面或异步执行器。不再并行建立前端SQL插件的另一条写入链。[rusqlite官方仓库](https://github.com/rusqlite/rusqlite)
- **方案B：**可使用`better-sqlite3`，打包时确认Electron ABI适配和原生二进制位置。该驱动的官方排错文档明确涉及Electron rebuild和ASAR问题。[驱动排错文档](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md)
- **另一候选驱动：**Node.js有内置`node:sqlite`，但应以选定Electron实际捆绑的Node版本和对应文档为准，不能直接用本机Node或latest文档作可用性保证；当前latest文档仍标记Release candidate且存在同步调用接口。[Node SQLite文档](https://nodejs.org/api/sqlite.html)

数据库放在用户应用数据目录；使用顺序编号SQL迁移并记录已执行版本，升级迁移由核心统一完成。早期直接写SQL即可，当前没有引入大型ORM或多数据库抽象的必要。这些属于建议，具体迁移库可在实施时选择。

## 6. MCP接入：两栈都可行，重点在进程生命周期

MCP官方同时提供Rust和TypeScript SDK。方案A可使用Rust的`rmcp`，无需为接入MCP再常驻一套Node服务；方案B可以用TypeScript SDK直接复用TypeScript业务模块。[官方SDK目录](https://modelcontextprotocol.io/docs/sdk)、[Rust SDK源码与示例](https://github.com/modelcontextprotocol/rust-sdk)、[TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

stdio传输由客户端启动服务器子进程并通过标准输入输出通信。因此，已经开机自启动的GUI进程，不能简单被另一个Agent接管为同一条stdio连接；如果客户端各自启动一个完整Todo后台，会引入多份状态和重复调度。[MCP stdio规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)

**当前推荐设计：**Electron主进程内嵌一个本机Streamable HTTP MCP端点；界面通过preload/IPC访问业务模块，MCP通过同一模块访问SQLite。HTTP只是本机接口，无需部署云服务器。仅监听`127.0.0.1`；依规范校验Origin并处理鉴权，不能因为在本机就默认任何请求都可信。[MCP Streamable HTTP规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

应用完全退出后，这个MCP接口也会停止。若后续确认Agent必须在应用退出时工作，再增加按需启动核心的策略；若目标客户端仅支持stdio，可增加按需启动的薄转发程序。当前不预先引入独立守护进程、Windows服务或常驻桥接器。目标客户端与协议版本的实际兼容性仍需在最小原型阶段确认。

## 7. 两套可落地结构

下列均为设计建议；目录本身不承担架构保证。先保持一个仓库、一个用户应用、一个业务与数据库所有者。

### 方案A（比较资料）

```text
src/                       React＋TypeScript
  features/                任务、习惯、灵感、设置界面
  platform/                封装Tauri命令和事件
src-tauri/src/
  desktop/                 托盘、自启动、单实例、贴边
  core/                    业务规则与操作
  storage/                 rusqlite、迁移、后台数据库worker
  mcp/                     rmcp及本机HTTP接入
```

调用路径：`React → Tauri命令 → core → storage → SQLite`；`Agent → MCP → core → storage → SQLite`。无需单独的Web服务器给React提供业务接口。Rust侧提供结构明确的请求/返回对象，JSON契约保持小而稳定。

### 方案B（已选定）

```text
src/
  renderer/                React＋TypeScript界面
  preload/                 少量受控的界面调用接口
  main/
    desktop/               托盘、自启动、单实例、贴边
    core/                  TypeScript业务规则
    storage/               SQLite驱动和迁移
    mcp/                   TypeScript SDK及本机HTTP接入
  shared/                  请求/返回类型
```

调用路径：`React → preload/IPC → core → storage → SQLite`；`Agent → MCP → core → storage → SQLite`。保持界面进程隔离，通过preload暴露具体操作，不把任意SQL或完整Node能力交给界面。[Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

早期小量数据库操作可保持简单；一旦迁移、批处理或查询影响响应，再将同步数据库操作放到worker。不要为了“后台”额外启动一套独立Node Web服务。跨方案可复用界面、SQL迁移、行为说明；Rust与TypeScript业务实现不能直接互换。

## 8. 打包与后续更新

Tauri在Windows支持MSI/WiX与NSIS安装程序；官方updater支持静态JSON或更新服务，更新包签名是必须项。这与Windows代码签名是不同问题。[Windows Installer](https://v2.tauri.app/distribute/windows-installer/)、[Tauri updater](https://v2.tauri.app/plugin/updater/)

Electron官方推荐Electron Forge入门打包；自动更新可使用官方文档中的Squirrel和`autoUpdater`流程。若选择electron-builder＋NSIS，应使用对应更新机制，不能默认NSIS与Squirrel的流程相同。[Electron打包入口](https://www.electronjs.org/docs/latest/tutorial/tutorial-prerequisites)、[Electron更新文档](https://www.electronjs.org/docs/latest/tutorial/updates)

**本项目建议：**第一版先能在本机安装、登录启动和保留数据；自动更新在需要分发新版本时加入。更新检查放在启动关键路径之后，避免阻塞打开任务列表。安装或升级后需要保持稳定的应用标识、数据目录和自启动入口。

## 9. 最小验证方案与剩余不确定性

本次只做资料调研和本机命令可用性检查，未运行下面的验证。以下为后续建议，不是已获得的结果或已确认验收标准。

后续先做方案B的最小可安装版本：单窗口任务列表、托盘、自启动、单实例、一次SQLite读写、一次MCP读写。桌面行为和MCP都可用后，再扩展完整业务。

| 验证 | 方法与记录 |
|---|---|
| 首次安装 | 记录Electron安装包体积、安装后占用及安装耗时 |
| 启动 | Release安装版，记录进程启动到托盘就绪、首次界面可交互；登录启动单独测 |
| 托盘唤出 | 保留隐藏窗口与重新创建窗口分别测，记录至少20次的中位数及P95 |
| 内存 | 显示、隐藏10分钟、重新打开三种状态，计入全部Electron子进程；私有内存和工作集分别报告 |
| 空闲CPU | 核心与全部子进程累计观察10分钟，检查是否有持续计时器、轮询或渲染 |
| MCP与数据 | Agent修改后界面刷新；双入口操作遵守同一规则；应用退出、重启后的连接行为明确 |
| 常驻恢复 | 跨日、系统休眠恢复、重复启动，检查习惯任务是否重复或遗漏 |

可以先把“托盘唤出P95≤200ms”作为讨论用目标，最终由用户确认；内存预算先取得真实进程总量，再决定是否值得牺牲唤出速度释放窗口。无需在需求尚未明确时承诺固定几十MB或固定启动秒数。

若Electron的资源占用不符合预期，先检查窗口策略、轮询、渲染和数据库操作。需要重新选型时，再用同一React界面、数据量和窗口策略制作对照；更换框架不保证解决问题。固定电脑、分辨率/缩放、Release构建、版本、数据量和空闲条件；不要用开发模式比较，也不要把一次测量推广为框架排名。

技术栈已确定。仍需在后续实现中明确Agent是否需要在应用完全退出后操作，以及可接受的常驻内存与唤出延迟；这些问题不影响按Electron搭建工程。当前没有本项目实测性能，不能用公开案例承诺具体内存或启动时间。
