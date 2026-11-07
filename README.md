<p align="center">
  <img src="docs/assets/dook-wordmark.png" alt="DOOK字标" width="560">
</p>

# DOOK-From DO to OK.

[![平台：Windows x64](docs/assets/badge-windows.svg)](#日常使用) [![数据：本地存储](docs/assets/badge-local-data.svg)](#本地数据与mcp) [![许可：GPLv3](docs/assets/badge-gplv3.svg)](LICENSE)

DOOK是一款面向工作场景的待办小记应用。用桌面便签快速记录和勾选，用主界面管理任务、习惯和小记。两处共用本地SQLite数据，修改即时同步。

## 日常使用

- **任务**｜今天任务按电脑本地日期显示，未完成的多天任务会跨日延续。可添加子事项跟踪进度，也可在分类内排序、置顶和归档。
- **习惯**｜按每天、指定星期或每隔N天的规则，在设定时间生成当天任务。当天的习惯任务可以暂停一次。
- **小记**｜在便签随手记录当天的想法，在主界面按主题或日期浏览。小记支持原地编辑、归档和恢复。
- **桌面便签**｜支持置顶和贴边自动隐藏。收起后将鼠标移到屏幕边缘的入口即可查看任务统计，点击展开便签。

启动后先显示桌面便签。单击系统托盘图标可唤出便签，右键可打开主界面或退出。关闭窗口会将它隐藏到托盘。便签中新建任务或小记时按Enter保存，编辑已有正文时也可在失焦后保存。

在主界面的设置中，可以切换浅色、深色或跟随系统外观，调整主题色、开机自启和便签行为。

### 桌面便签操作演示

#### 添加任务并勾选完成

点击加号，输入「发送项目周报」并按Enter保存。发完周报后，勾选任务即可更新完成进度。

![在桌面便签中新增「发送项目周报」，按Enter保存后勾选完成](docs/assets/note-add-task.gif)

#### 切到小记记录评审备忘

点击底部的类别图标切到小记，记下「下次评审补充失败案例」，再切回任务列表。

![从任务切到小记，保存评审备忘后切回任务列表](docs/assets/note-add-jotting.gif)

#### 贴边收起，再快速展开

把便签拖到屏幕边缘，移开鼠标后它会自动收起。悬停边缘可查看任务进度，点击统计胶囊即可展开。

![将便签拖到屏幕左侧，自动收起后悬停查看进度并点击展开](docs/assets/note-edge-docking.gif)

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

DOOK将任务、习惯和小记保存在本地SQLite数据库中，窗口位置和偏好也保存在本机。开发版和安装版使用独立的数据目录。

本地MCP端点默认为`http://127.0.0.1:32145/mcp`，当前提供`app_diagnostics`诊断工具。数据目录、端口设置和凭证用法见[MCP接入文档](doc/mcp.md)。

## 项目文档

- [产品需求](doc/todo.md)
- [工程结构](doc/codebase.md)
- [界面框架与样式](docs/ui-framework-and-styles.md)
- [桌面便签验证](doc/desktop-validation.md)
- [MCP接入](doc/mcp.md)

## 开源许可

DOOK以[GNU通用公共许可证第3版](LICENSE)发布（`GPL-3.0-only`）。第三方组件遵循各自的许可证。

Copyright © 2026 SEVEN-TSY
