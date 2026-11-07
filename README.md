<p align="center">
  <img src="docs/assets/dook-wordmark.png" alt="DOOK字标" width="560">
</p>

# DOOK-From DO to OK.

DOOK是一款Windows桌面待办与小记应用。用桌面便签快速记录和勾选，用主界面管理任务、习惯和小记。两处共用本地SQLite数据，修改即时同步。

## 日常使用

- **任务**｜今天任务按电脑本地日期显示，未完成的多天任务会跨日延续。可添加子事项跟踪进度，也可在分类内排序、置顶和归档。
- **习惯**｜按每天、指定星期或每隔N天的规则，在设定时间生成当天任务。当天的习惯任务可以暂停一次。
- **小记**｜在便签随手记录当天的想法，在主界面按主题或日期浏览。小记支持原地编辑、归档和恢复。
- **桌面便签**｜支持置顶和贴边自动隐藏。收起后将鼠标移到屏幕边缘的入口即可查看任务统计，点击展开便签。

启动后先显示桌面便签。单击系统托盘图标可唤出便签，右键可打开主界面或退出。关闭窗口会将它隐藏到托盘。便签中新建任务或小记时按Enter保存，编辑已有正文时也可在失焦后保存。

在主界面的设置中，可以切换浅色、深色或跟随系统外观，调整主题色、开机自启和便签行为。

## 本地开发

项目使用Electron、React、TypeScript和SQLite。需要Node.js 24.15及以上的24.x版本。

```powershell
npm ci
npm run dev
```

也可以使用`pnpm install`和`pnpm dev`。首次启动需要下载Electron桌面运行时。

| 命令                   | 用途                                                      |
| ---------------------- | --------------------------------------------------------- |
| `npm run typecheck`    | 检查TypeScript类型                                        |
| `npm test`             | 运行任务规则、数据库迁移和MCP等测试                       |
| `npm run smoke`        | 运行真实Electron双窗口集成验证，结果保存在`.local/smoke/` |
| `npm run build`        | 构建到`out/`                                              |
| `npm start`            | 运行已有的生产构建                                        |
| `npm run pack`         | 生成免安装目录到`release/`                                |
| `npm run dist:win`     | 生成Windows x64 NSIS安装包                                |
| `npm run format:check` | 检查代码和文档格式                                        |

## 本地数据与MCP

开发版默认将数据保存在`%APPDATA%/myTodo-development/`，安装版使用`%APPDATA%/myTodo/`。目录内的`mytodo.sqlite`保存业务数据，`desktop-settings.json`保存窗口位置和偏好。可通过环境变量`MYTODO_DATA_DIR`覆盖数据目录。

本地MCP端点默认为`http://127.0.0.1:32145/mcp`，端口可通过`MYTODO_MCP_PORT`调整。凭证保存在数据目录下的`mcp-token`，当前提供`app_diagnostics`诊断工具。

## 项目文档

- [产品需求](doc/todo.md)
- [工程结构](doc/codebase.md)
- [界面框架与样式](docs/ui-framework-and-styles.md)
- [桌面便签验证](doc/desktop-validation.md)
- [MCP接入](doc/mcp.md)
