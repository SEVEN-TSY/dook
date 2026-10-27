# myTodo

基于Electron＋React＋TypeScript＋Node.js＋SQLite的Windows桌面应用工程骨架。

当前只搭建工程分层、构建链路和基础设施验证页。任务、习惯、灵感、类别管理、托盘、自启动、贴边隐藏、快捷唤出及未来AI功能均未实现。

## 启动

开发环境使用Node.js 24.15及以上的24.x版本和npm。

```powershell
npm ci
npm run dev
```

打开Electron窗口后，点击“运行检查”，验证以下真实链路：

1. React通过隔离的preload与Electron主进程通信。
2. 核心服务执行SQLite临时表写入、查询与事务回滚。
3. 官方MCP客户端完成本机HTTP握手并调用`app_diagnostics`，访问同一个核心服务。

仅在浏览器中打开页面时，页面会提示桌面桥接不可用；请通过Electron运行。

## 常用命令

| 命令                   | 用途                                             |
| ---------------------- | ------------------------------------------------ |
| `npm run dev`          | 启动开发窗口，界面支持热更新                     |
| `npm run typecheck`    | 检查主进程、preload、共享契约和界面的类型        |
| `npm test`             | 验证数据库迁移、临时读写、MCP协议与访问限制      |
| `npm run build`        | 类型检查并生成生产代码到`out/`                   |
| `npm start`            | 运行已有的生产构建，需先执行build                |
| `npm run smoke`        | 构建并启动真实Electron，自动点击测试页并生成截图 |
| `npm run pack`         | 生成可运行的未安装目录到`release/`               |
| `npm run dist:win`     | 构建Windows x64 NSIS安装包到`release/`           |
| `npm run format`       | 格式化代码与新增文档                             |
| `npm run format:check` | 检查格式                                         |

打包工具及安装包配置已提供。代码签名、自动更新与发布流程留待后续接入。

## 代码结构

```text
src/
  main/                     Electron主进程：组装依赖、管理生命周期
    desktop/                窗口、IPC与桌面适配
    core/                   界面与MCP共享的应用核心
    storage/                SQLite连接、迁移与仓储扩展位置
    mcp/                    官方SDK、本机HTTP端点、凭证与协议探测
  preload/                  仅暴露白名单桌面API
  renderer/                 React界面
    src/
      components/           通用展示组件
      features/             工程验证页与未来业务模块位置
      platform/             界面调用桌面API的适配层
      styles/               样式
  shared/                   跨进程数据契约与IPC频道名
scripts/                    Electron集成验证脚本
tests/                      Node环境基础设施测试
doc/                        需求、选型、架构与MCP说明
```

完整目录、每个模块的职责、调用顺序与扩展方式见[codebase结构说明](doc/codebase.md)。本机MCP的连接方法见[MCP说明](doc/mcp.md)。

## 本地数据与配置

| 项目           | 默认值                                    |
| -------------- | ----------------------------------------- |
| 开发数据目录   | `%APPDATA%/myTodo-development/`           |
| 安装版数据目录 | `%APPDATA%/myTodo/`                       |
| SQLite文件     | 数据目录下`mytodo.sqlite`                 |
| MCP凭证        | 数据目录下`mcp-token`，首次启动生成并复用 |
| MCP地址        | `http://127.0.0.1:32145/mcp`              |
| 集成验证输出   | `.local/smoke/`，使用独立数据库与随机端口 |

可以在启动前设置环境变量覆盖数据目录或端口。代码不会自动读取`.env`。

```powershell
$env:MYTODO_DATA_DIR = 'E:\myTodo-local-data'
$env:MYTODO_MCP_PORT = '32146'
npm run dev
```

端口被占用或凭证异常时，窗口仍可打开，验证页展示MCP不可用的原因。当前关闭窗口会完全退出应用，MCP端点同时关闭。

## 选型落地

- React＋TypeScript＋Vite负责本地静态界面，electron-vite统一构建三个进程入口。
- Electron主进程持有应用服务、SQLite连接和MCP HTTP端点，不启动独立常驻后端。
- SQLite使用所选Electron内嵌Node.js提供的`node:sqlite`，避免原生npm驱动的Electron ABI重编译。驱动封装在`storage/database.ts`，后续可在此替换。
- MCP使用官方`@modelcontextprotocol/sdk`，当前仅提供基础诊断工具。
- 渲染进程启用sandbox、context isolation，关闭Node integration，通过明确的API访问主进程。

需求以[需求文档](doc/todo.md)为准；既有[技术栈调研](doc/tech-stack-research.md)保留选型背景。
