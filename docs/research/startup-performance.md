# 开机自启动耗时排查与优化方案

日期：2026-11-13
范围：Windows 安装版（`D:\dook\DOOK.exe`，0.1.2）开机自启后从进程创建到桌面便签可见。

## 1. 结论

- 温启动实测 **约 670–800 ms**（已安装版：首次 3 连测为 671/672/1719 ms；复测含全新用户数据目录为 739/749/763/805 ms）。其中 1719 ms 属一次性异常，未能复现，**不能据此推断存在稳定的系统层（Defender 首扫）开销**。
- 应用自身的关键路径里，**约 270–350 ms 花在启动时根本用不到的模块上**：MCP SDK（静态导入实测 176 ms，含 streamableHttp 25 ms）、`zod`（约 95 ms）。它们通过 `index.ts → diagnostics → mcp/probe`、`index.ts → mcp/server`、`index.ts → ai/connection → storage/ai-settings`、`desktop/ipc.ts` 四条静态导入链被提前加载。
- 把这些子系统改成"窗口可见后再加载/首次使用时再加载"，预计温启动从 ~670 ms 降到 **~400–450 ms**，这是唯一有实测支撑的大块收益；其余部分（Chromium 启动 ~270 ms、渲染层 ~140–200 ms）属于 Electron 固有成本。
- 硬件加速开关 A/B 无收益（见 §5），数据库迁移 15 ms、托盘 28 ms 都不是瓶颈。**代码签名与启动耗时无关**（见 §5、P2-1）。

## 2. 测量方法

| 项 | 做法 |
| --- | --- |
| 计时终点 | 4 ms 轮询 `EnumWindows`，按 PID + 窗口标题 + `IsWindowVisible` 判定便签首次可见 |
| 分阶段 | 临时在 `out/main/index.js`（构建产物，非源码）注入 `process.uptime()` 里程碑，测完已还原 |
| 数据隔离 | `DOOK_DATA_DIR` 指向 `.local/bench/data`，`DOOK_MCP_PORT=0`，不影响用户数据和端口 |
| 样本 | 温启动 3 次、打包版 3 次、硬件加速 A/B 各 3 次、SDK 导入探针 3 次 |
| 工具 | `.local/bench/measure.ps1`（已被 `.gitignore` 覆盖，可重复运行） |

限制：无法重启用户机器复现真实开机；`Microsoft-Windows-Diagnostics-Performance` 事件日志需要管理员权限，未取得开机侧的逐应用耗时。

说明：计时基于 2026-11-12 17:50 构建的 `out/`（对应已安装版 0.1.2）。测量期间 `src/main/index.ts` 因 AI 调用日志的在研改动有微调，但只新增回调、未改变启动期的静态导入链，结论不受影响。

## 3. 实测时间线（温启动，与安装版同源代码）

| 里程碑 | 样本（ms，相对进程启动） |
| --- | --- |
| 主进程脚本开始执行（含全部静态 import） | 359 / 374 / 440 |
| 单实例锁完成 | +2 |
| `whenReady`（Chromium 初始化） | 628 / 627 / 663 |
| 数据目录就绪 | +2 |
| SQLite 打开 + 迁移 | +15 |
| 补齐当天习惯任务 | +1.4 |
| Desktop 构造 | +1.5 |
| MCP 端点监听 | +30 |
| IPC 注册完成 | +1 |
| BrowserWindow 创建 | +32 |
| 渲染层加载完成（`did-finish-load`） | +140 |
| 便签 `show()` | +32（窗口可见 ≈ 890 / 935 / 946） |
| 托盘创建 | +28（在窗口之后） |
| 首帧绘制 | 导航后 208–264 |

打包版同口径总耗时：671 / 672 / 1719 ms。其中 1719 ms 未能复现：后续用全新用户数据目录复测为 749 / 763 / 805 / 739 ms（分别是"全新目录 → 复用同目录"两轮），说明它不是稳定的 Defender 首扫成本，更接近一次性异常。

## 4. 可优化项（按收益排序）

### P0-1 把 MCP 端点移出启动关键路径（收益 ~150–200 ms）

现状：`src/main/index.ts:129-142` 在创建窗口前 `await startMcpEndpoint(...)`；`src/main/mcp/server.ts:4-5` 静态导入 `McpServer` 与 `StreamableHTTPServerTransport`，模块求值即付出实测 176 ms；监听本身再占 30 ms。

方案：
- `startMcpEndpoint` 内部改为 `await import('@modelcontextprotocol/sdk/server/mcp.js')` 等动态导入，协议对象在首次请求时创建。
- `index.ts` 先 `await desktop.openWindow('note')` 和 `startTray()`，再以 `void startMcp()` 异步启动；`mcp` 状态对象保持可变，失败只更新状态并在诊断中体现。
- 渲染层只在 `AboutSettings.tsx:16` 读 `getBootstrap()`，启动流程不依赖 MCP 已就绪。
- 代价：开机后约 1 秒内 MCP 客户端连接会被拒绝；对"本机 Agent 工具"可接受，需在 `doc/mcp.md` 说明。

### P0-2 让 `zod` 与 AI/诊断模块按需加载（收益 ~90–120 ms）

现状：`zod` 实测 95 ms，被 4 处静态导入拖进启动：`desktop/ipc.ts:3`（AI 配置校验）、`mcp/probe.ts:3`、`storage/ai-settings.ts:3`、`storage/ai-call-log.ts:3`；其中经 `index.ts:16 runDiagnostics → diagnostics.ts:4 probeMcpEndpoint`、`index.ts:11 AiConnection` 两条链无条件加载。

方案：
- `registerIpc` 的 `ai` 参数由实例改为工厂 `() => AiConnection`，首次 AI 请求时构造（`AiConnection` 构造只建 store，成本低）。
- AI 配置的 3 个 zod schema（`ipc.ts:13-19`）移到 `main/ai/input.ts`，在 handler 内 `await import()`；或改写成手写校验（字段少，约 30 行），彻底去掉这条链。
- `runDiagnostics` 在 IPC handler 内动态 `import('./desktop/diagnostics')`，诊断只在设置页触发。
- 完成后 `index.ts` 的启动导入只剩 electron、core、storage、desktop、shared。

### P1-1 渲染层按页面拆包（收益 ~30–60 ms，且降低首帧内存）

现状：`out/renderer/assets/index-*.js` 单包 541 KB、CSS 99 KB；`TasksPage.tsx:56` 静态导入 `SettingsPage`，其下还有 AI 配置表单、Radix Select/Dialog 等，便签首帧也要解析它们。渲染层从导航到首帧实测 208–264 ms。

方案：
- 用 `React.lazy` + `Suspense` 把 `SettingsPage`（含 AI 配置）、`HabitsPanel`、`InspirationPanel` 等只在需要时渲染的面板拆成独立 chunk。
- 保持便签首帧不出现 fallback 闪烁：懒加载边界放在页面切换层，`TasksPage` 首屏仍同步。
- 验收看 chunk 体积与首帧时间，不追求把主包压到某个绝对值。

### P1-2 启动尾部清理（收益 5–15 ms，顺带修两个行为问题）

- `NoteController.recover()`（`note-controller.ts:235-253`）每次启动都无条件 `persist()` 同步写 `desktop-settings.json`；启动期同步写盘可直接去掉，改为仅在位置/贴边实际变化时写。
- `readPreferences` 在一次启动里被读 3 次（`index.ts:57`、`desktop.ts:32`、`note-controller.ts:58`），合并为读一次后传递。
- `startTray()`（`desktop.ts:50`）在窗口 `show()` 之后紧接着执行，与首帧抢主线程；延迟到首帧后再建即可。
- `configureLaunchAtLogin`（`login-item.ts:10-11`）每次启动写两次注册表，且 `{enabled:true}` 会把用户在任务管理器里禁用的自启重新打开（`name` 参数在 Windows 上无效）。改为仅在偏好变化时写入，或先判断系统当前状态。

### P2-1 代码签名：与启动耗时无关，只影响发布信任（可选项）

`D:\dook\DOOK.exe` 当前 `NotSigned`（238 MiB 单文件 PE，`app.asar` 57 MB）。**这不构成启动耗时问题**：

- 原来的 1719 ms 复测未复现（见 §3），没有证据表明 Windows 在启动时对未签名程序做了稳定可测的额外校验。
- 同机对照：Clash Verge 2.1.2（`D:\Program Files\Clash Verge`，同样通过 `HKCU\...\Run` 自启）的 `clash-verge.exe`、`verge-mihomo.exe`、服务与卸载器**全部 `NotSigned`**，只有捆绑的第三方 `enableLoopback.exe` 有签名；它并不比 DOOK 慢在"签名校验"上。
- 普通桌面程序启动不要求 Authenticode 有效签名；强制验签只出现在驱动、企业 WDAC/AppLocker 策略，以及带 MOTW 的下载文件首次运行的 SmartScreen 场景。安装后的自启程序通常没有 MOTW。

所以签名属于"用户属性面板里显示发布者、避免未知发布者提示"的发布体验问题，排 P2 且独立于启动优化。若要做，仓库当前无 CI workflow、发版为本地 `npm run dist:win`，需在发布机通过 `CSC_LINK`/`CSC_KEY_PASSWORD`（或 `win.azureSignOptions`）接入。

### P2-2 可观测性：把启动预算变成回归项

- 增加 `DOOK_STARTUP_TRACE=1` 时输出里程碑到用户数据目录的日志（本次测量用的就是这套埋点），便于用户开机后回传真实数字。
- `scripts/run-smoke.mjs` 增加宽松阈值的启动用例（例如温启动 ≤ 800 ms，先防回退，再逐步收紧）。

## 5. 已验证但不建议改动的地方

| 假设 | 实测 | 结论 |
| --- | --- | --- |
| 默认关闭硬件加速拖慢启动（`preferences.ts:18`、`index.ts:57`） | 开：976 / 1006 / 1022 ms；关：964 / 1009 / 1010 ms | 无收益，保持默认关闭 |
| SQLite 迁移/补齐习惯任务拖慢启动 | 15 ms + 1.4 ms（库 118 KB） | 不是瓶颈 |
| 透明置顶窗口创建慢 | 创建 +32 ms，`show()` +32 ms | 收益有限，改动风险高，不动 |
| 托盘图标 | 28 ms，且在窗口可见之后 | 只影响首帧流畅度，见 P1-2 |
| 未签名导致启动时被额外校验 | 1719 ms 未复现（复测 739–805 ms）；同机 Clash Verge 自家二进制全部 `NotSigned`，同样走 `HKCU\...\Run` 自启 | 无证据，签名与启动无关 |

## 6. 实施顺序与验收

1. P0-1 + P0-2（同一 PR，都是"启动只加载窗口需要的模块"）。
2. 用 `.local/bench/measure.ps1` 复测温启动：目标 **≤ 550 ms**（当前 671 ms），随后按 P1 继续收敛到 ~450 ms。
3. P1-1、P1-2 各自独立 PR；P1-1 需附拆包前后 chunk 体积与首帧时间。
4. P2-1 与启动无关，按发布体验单独排期，不占启动预算；P2-2 提供开机实测基线后再设定开机侧预算。
5. 同步更新 `doc/codebase.md` §3"启动、窗口与退出"的顺序描述（MCP 不再先于窗口）。

## 7. 风险

- MCP 延迟启动使首个外部连接可能失败一次，需要在 `doc/mcp.md` 和工具调用错误提示里说明重试。
- 懒加载 AI/诊断后，首次打开设置页多 ~100 ms，属可接受的一次性成本。
- 渲染层拆包若把共用组件拆进多个 chunk，可能增加总传输量；以实测首帧为准，不做纯体积优化。
