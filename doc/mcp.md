# 本机MCP基础接口

当前MCP只用于验证技术链路，无任务、习惯或小记工具。

## 运行方式

Electron主进程内嵌官方TypeScript SDK的Streamable HTTP服务，默认地址为`http://127.0.0.1:32145/mcp`。不启动额外常驻后端，应用退出时停止监听。

服务采用无会话的JSON响应模式；不提供SSE订阅或旧式HTTP＋SSE传输。每次请求创建独立协议对象，并复用主进程已有的核心服务与数据库连接。

## 凭证与客户端

开发版的数据目录默认为`%APPDATA%/dook-development/`，安装版默认为`%APPDATA%/dook/`。可通过环境变量`DOOK_DATA_DIR`覆盖。目录内的`dook.sqlite`保存业务数据，`desktop-settings.json`保存窗口位置和偏好。

升级前请退出旧版。首次启动新版会从对应的旧数据目录导入数据库、窗口偏好和MCP凭证，保留原文件。若使用自定义目录，数据库在同一目录内迁移。新版优先读取`DOOK_`环境变量，也兼容旧版的变量名。

首次启动会在数据目录创建`mcp-token`文件，后续启动复用此凭证。

支持Streamable HTTP及静态Bearer认证的MCP客户端需要配置：

| 字段                | 内容                                             |
| ------------------- | ------------------------------------------------ |
| 传输方式            | Streamable HTTP                                  |
| URL                 | `http://127.0.0.1:32145/mcp`，以页面实际显示为准 |
| Authorization请求头 | `Bearer <mcp-token文件中的内容>`                 |

配置格式按具体客户端要求填写。凭证不返回界面、不进入Git、不写日志。未提供OAuth或stdio桥接。

服务只监听IPv4 loopback，校验Host和可选Origin，要求每次请求携带正确Bearer凭证。未带Origin的本机原生客户端可接入；提供Origin时必须与监听端点同源。

## 唯一工具

`app_diagnostics`：不接收参数，通过共享`AppService`验证核心服务与SQLite临时表读写。返回结果示意：

```json
{
  "service": "dook-core",
  "checkedAt": "<检查时间>",
  "storage": {
    "sqliteVersion": "<实际SQLite版本>",
    "migrationVersion": 1,
    "journalMode": "wal",
    "roundTrip": true
  }
}
```

测试数据在临时表中写入，读取后回滚。该工具不修改持久业务数据。

## 验证

在Electron测试页点击“运行检查”，主进程会用官方SDK客户端实际完成初始化和工具调用。自动验证使用`npm test`或`npm run smoke`。

如果默认端口占用，可以先设置`DOOK_MCP_PORT`再启动。`0`表示系统分配随机空闲端口，主要供自动验证使用。服务启动失败时页面展示错误，其他桌面基础能力仍可运行。

后续业务工具在`src/main/mcp/`注册，所有写入交给`src/main/core/`处理，再由`src/main/storage/`持久化。

参考：[官方SDK的无会话Streamable HTTP示例](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/simpleStatelessStreamableHttp.ts)。
