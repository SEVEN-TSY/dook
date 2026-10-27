# myTodo

基于Electron＋React＋TypeScript＋SQLite的Windows待办应用。

首个业务版本支持今天任务的新增、行内编辑、完成、取消完成和确认后永久删除。主界面和独立桌面便签共享数据，操作后即时同步；任务按创建顺序排列，已完成任务保留原位。按电脑本地日期展示当天任务，旧任务保留数据但不自动延续。

## 启动

使用Node.js 24.15及以上的24.x版本和npm。

```powershell
npm ci
npm run dev
```

也可使用`pnpm install`、`pnpm dev`。Electron 45的npm包需要单独安装桌面二进制，`dev`和`start`会先调用官方`install-electron`安装器；已安装时直接跳过。首次安装需要下载Electron，离线时应提前准备下载缓存。

启动时同时显示主界面和默认置顶的桌面便签。两个窗口均可输入任务描述后回车新增；点击描述编辑，回车保存，Esc取消。便签可通过系统标题栏拖动并记住位置。两处都能打开另一窗口，关闭一个后另一窗口继续运行，全部关闭时退出。

习惯、多天任务、标签、排序、历史入口、托盘、自启动、贴边隐藏和MCP业务工具尚未实现。

## 常用命令

| 命令                   | 用途                                             |
| ---------------------- | ------------------------------------------------ |
| `npm run dev`          | 启动开发窗口                                     |
| `npm run typecheck`    | 检查主进程、preload、共享契约和界面类型          |
| `npm test`             | 验证任务规则、日期切换、持久化、迁移与MCP        |
| `npm run build`        | 类型检查并构建到`out/`                           |
| `npm start`            | 运行已有生产构建                                 |
| `npm run smoke`        | 真实Electron双窗口交互、关闭重开、退出重启与截图 |
| `npm run pack`         | 生成未安装目录到`release/`                       |
| `npm run dist:win`     | 构建Windows x64 NSIS安装包                       |
| `npm run format:check` | 检查格式                                         |

集成验证使用独立数据目录，模拟系统确认框的取消和确认返回值，其余链路运行真实React、preload、IPC、SQLite和MCP。输出位于`.local/smoke/`。

## 本地数据与配置

| 项目           | 默认值                          |
| -------------- | ------------------------------- |
| 开发数据目录   | `%APPDATA%/myTodo-development/` |
| 安装版数据目录 | `%APPDATA%/myTodo/`             |
| SQLite文件     | 数据目录下`mytodo.sqlite`       |
| 便签位置       | 数据目录下`note-position.json`  |
| MCP凭证        | 数据目录下`mcp-token`           |
| MCP地址        | `http://127.0.0.1:32145/mcp`    |

可以设置`MYTODO_DATA_DIR`和`MYTODO_MCP_PORT`覆盖目录和端口，代码不会自动读取`.env`。MCP端点启动失败不影响任务功能，当前只提供`app_diagnostics`。全部窗口关闭时数据库和端点一起关闭。

工程分层见[codebase结构说明](doc/codebase.md)，接入说明见[MCP说明](doc/mcp.md)，需求见[需求文档](doc/todo.md)。代码签名、自动更新与发布流程留待后续接入。
