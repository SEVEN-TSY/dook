# 今天任务

`TasksPage`由主界面与桌面便签共用。`useTasks`通过platform层取得DesktopApi并订阅主进程通知。支持新增、行内编辑、完成与取消完成、原生确认删除和打开另一窗口。

界面不访问数据库，也不创建MCP客户端。
