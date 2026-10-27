# myTodo codebase结构说明

本轮目标是形成可继续开发的完整工程底座，并用一个测试页验证技术链路。业务功能尚未开始，现有诊断接口不承担任务等业务操作。

## 1. 整体结构

一个Electron应用包含主进程、preload隔离桥接和React渲染进程。主进程同时拥有应用核心、SQLite连接和本机MCP端点。

```text
React界面
  ↓ renderer/platform：调用受控桌面API
preload：contextBridge白名单
  ↓ Electron IPC
desktop/ipc：验证来源、包装结果
  ↓
AppService ← MCP工具 ← Streamable HTTP ← Agent
  ↓
storage：SQLite连接、SQL迁移、后续仓储
  ↓
用户数据目录/mytodo.sqlite
```

React与MCP最终访问主进程中同一个`AppService`实例。当前核心只有诊断方法，后续业务在该层扩展。HTTP监听器属于Electron主进程，应用退出时一起关闭。

## 2. 完整源码布局

```text
myTodo/
├─ package.json                    依赖、脚本、Electron入口
├─ package-lock.json               锁定依赖版本
├─ electron.vite.config.ts         main/preload/renderer三路构建
├─ electron-builder.yml            Windows NSIS与应用标识
├─ tsconfig.json                   TypeScript工程索引
├─ tsconfig.base.json              共享严格类型配置
├─ tsconfig.node.json              主进程、preload和测试类型环境
├─ tsconfig.web.json               React渲染进程类型环境
├─ .editorconfig                   编辑器基础格式
├─ .prettierrc.json                 代码格式规则
├─ .prettierignore                  格式化排除目录与既有需求文档
├─ .gitignore                      忽略依赖、产物与本地数据
├─ README.md                       启动和命令入口
├─ doc/
│  ├─ todo.md                      原始需求
│  ├─ tech-stack-research.md       既有选型调研
│  ├─ codebase.md                  本文
│  └─ mcp.md                       MCP协议、鉴权与接入说明
├─ src/
│  ├─ main/
│  │  ├─ index.ts                  组合根：创建实例、启动、退出清理
│  │  ├─ desktop/
│  │  │  ├─ window.ts              窗口参数、preload路径、页面加载
│  │  │  ├─ ipc.ts                 白名单IPC、请求来源检查、结果包装
│  │  │  ├─ diagnostics.ts         测试页诊断编排与计时
│  │  │  └─ README.md              后续Windows能力的接入位置
│  │  ├─ core/
│  │  │  ├─ app-service.ts         共享应用入口及存储诊断接口
│  │  │  └─ README.md              业务层扩展约定
│  │  ├─ storage/
│  │  │  ├─ database.ts            SQLite生命周期、迁移执行、临时读写
│  │  │  ├─ migrations.ts          按版本递增的SQL迁移
│  │  │  └─ repositories/
│  │  │     └─ README.md           后续业务仓储位置
│  │  └─ mcp/
│  │     ├─ server.ts              本机HTTP、访问校验、官方SDK工具注册
│  │     ├─ token.ts               持久化本机Bearer凭证
│  │     └─ probe.ts               官方SDK客户端真实协议探测
│  ├─ preload/
│  │  └─ index.ts                  通过contextBridge暴露DesktopApi
│  ├─ renderer/
│  │  ├─ index.html                HTML入口与CSP
│  │  └─ src/
│  │     ├─ main.tsx               React挂载入口
│  │     ├─ App.tsx                应用外壳与当前验证页
│  │     ├─ env.d.ts               window.myTodo类型声明
│  │     ├─ platform/
│  │     │  └─ desktop.ts          获取桌面API及解析调用结果
│  │     ├─ components/
│  │     │  ├─ Icon.tsx            轻量SVG图标
│  │     │  └─ StatusBadge.tsx     状态标签
│  │     ├─ features/
│  │     │  ├─ diagnostics/
│  │     │  │  ├─ DiagnosticsPage.tsx  基础设施验证页
│  │     │  │  └─ useDiagnostics.ts    启动信息及检查状态
│  │     │  ├─ tasks/README.md     任务视图预留
│  │     │  ├─ habits/README.md    习惯视图预留
│  │     │  ├─ inspirations/README.md  灵感视图预留
│  │     │  └─ settings/README.md  设置视图预留
│  │     └─ styles/
│  │        ├─ global.css         基础样式与通用状态
│  │        └─ layout.css         验证页布局
│  └─ shared/
│     ├─ contracts.ts              跨进程可序列化类型及DesktopApi
│     └─ channels.ts               IPC频道名
├─ scripts/
│  ├─ run-smoke.mjs                清理启动环境并拉起验证进程
│  └─ electron-smoke.mjs           加载真实应用、点击检查、保存截图
└─ tests/
   ├─ storage.test.ts              持久化迁移、临时读写与凭证复用
   └─ mcp.test.ts                  SDK端到端调用及访问限制
```

构建产物位于`out/main/`、`out/preload/`、`out/renderer/`；安装包位于`release/`；集成验证数据、结果和截图位于`.local/smoke/`。这些内容均不进入Git。

## 3. 各层边界

| 层                | 负责什么                                  | 依赖方向                         |
| ----------------- | ----------------------------------------- | -------------------------------- |
| renderer/features | 页面、交互和视图状态                      | components、platform、shared类型 |
| renderer/platform | 统一访问桌面桥接，处理调用结果            | shared契约、window.myTodo        |
| preload           | 把少量显式方法映射到固定IPC频道           | electron、shared                 |
| main/desktop      | 窗口与操作系统能力、IPC来源验证、桌面编排 | core及必要基础设施               |
| main/core         | 应用用例与业务规则，当前只有诊断入口      | shared类型、通过注入得到的接口   |
| main/storage      | SQL、迁移、连接及后续仓储实现             | node:sqlite、shared类型          |
| main/mcp          | 将MCP工具参数转交核心服务，管理协议与鉴权 | 官方SDK、core                    |
| shared            | 纯数据类型与固定频道名                    | 不导入Electron、React或Node.js   |
| main/index.ts     | 组装具体实现与管理生命周期                | 可以引用所有主进程模块           |

核心层不导入Electron或MCP SDK。桌面与MCP处理器不直接编写业务SQL。React不能直接访问文件系统或数据库。

## 4. 启动与退出

1. `main/index.ts`确定数据目录并取得单实例锁。
2. Electron ready后创建唯一`AppDatabase`，执行缺失的SQL迁移。
3. 将数据库作为存储诊断实现注入`AppService`。
4. 读取或创建本机MCP凭证，在`127.0.0.1`监听HTTP端点；失败则记录可见状态。
5. 创建窗口，注册固定IPC处理器，再加载React页面。
6. React通过`getBootstrap`读取实际运行版本、数据目录与端点状态。
7. 用户运行检查，主进程编排SQLite及真实MCP客户端调用，返回结构化报告。
8. 退出时移除IPC处理器、关闭HTTP连接、关闭SQLite，最后退出Electron。

同一个数据目录重复启动会唤出已有窗口。当前不保留托盘进程，关闭窗口即退出。开发数据目录与安装版数据目录分开，集成验证另用独立目录。

## 5. 当前接口

`src/shared/contracts.ts`定义完整的跨进程返回类型。两项桌面API均不接收外部参数：

| 接口               | 返回                          | 作用                          |
| ------------------ | ----------------------------- | ----------------------------- |
| `getBootstrap()`   | `ApiResult<BootstrapInfo>`    | 读取真实运行信息及MCP监听状态 |
| `runDiagnostics()` | `ApiResult<DiagnosticReport>` | 验证IPC、SQLite与MCP三项链路  |

`ApiResult`使用`ok`区分成功数据和可展示错误，preload不会暴露完整`ipcRenderer`。主进程拒绝非当前主窗口主Frame的调用。

MCP当前只有`app_diagnostics`，无输入参数，返回核心服务标识、检查时间和SQLite诊断。它访问的核心服务与IPC一致。

## 6. 数据库策略

使用`node:sqlite`的同步接口；当前小型诊断操作在主进程执行。驱动局限在`storage/`。后续查询、批处理或迁移变重时，可把存储执行迁移到worker，不需要独立后端服务。

- 数据文件位于Electron用户数据目录。
- 文件数据库开启WAL、外键与busy timeout。
- `schema_migrations`记录执行版本，迁移在事务中执行，失败回滚。
- 当前只有基础元数据表`app_metadata`，没有任务等业务表。
- 测试页用连接级临时表进行真实读写，结束时回滚，不向持久库写测试事项。
- 当前固定Electron版本使用其内嵌Node.js的SQLite API；升级Electron后需要继续运行真实Electron集成验证。

研究文档中的better-sqlite3属于可选实现建议。本轮选择内置驱动以减少原生模块构建环节，底层持久化仍为SQLite。

## 7. 后续开发如何加入功能

以“创建任务”为例，后续按以下顺序扩展；当前未创建这些业务接口和表：

1. 在`shared/contracts.ts`增加可序列化的任务数据和明确的桌面API契约。
2. 在`storage/migrations.ts`追加业务表迁移，在`storage/repositories/`实现仓储。
3. 在`core/`定义仓储接口和创建任务用例，集中校验标题、任务形态、子事项和进度等规则。
4. 在`main/index.ts`注入仓储，在`desktop/ipc.ts`和`preload/index.ts`添加显式映射。
5. 在`mcp/`注册对应工具，用SDK参数Schema校验输入，调用同一核心用例。
6. 在`renderer/features/tasks/`实现视图，通过`renderer/platform/`使用桌面API。
7. 在关键业务事务提交后增加主进程到界面的变更通知，届时同步扩展契约、preload和界面订阅。

习惯每日生成由主进程调度；托盘、自启动与贴边隐藏放入`desktop/`；界面配置统一放入`features/settings/`。这些只是扩展位置，尚未实现。

## 8. 验证与范围

- `npm test`在Node环境验证SQLite迁移和持久化、MCP SDK协议调用以及访问限制。
- `npm run smoke`启动生产构建的真实Electron应用，等待React和preload就绪，自动点击“运行检查”，要求三项通过，再保存截图和JSON结果。
- 集成验证使用软件渲染以稳定生成截图，不用于判断GPU表现或图形性能。
- `npm run build`只负责类型与构建，不能替代桌面运行验证。
- 本轮不测量常驻内存、开机耗时或托盘唤出延迟，因为相关产品行为尚未实现。
- 安装包配置已准备；签名、自动更新和安装验收尚未实施。

参考：[Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)、[Electron版本及内嵌Node.js](https://releases.electronjs.org/releases/stable)、[Node.js SQLite](https://nodejs.org/api/sqlite.html)、[官方TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)。
