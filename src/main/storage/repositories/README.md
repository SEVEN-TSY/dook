# 任务仓储

`TaskRepository`接收AppDatabase的SQLite连接，实现核心层TaskStore。SQL限制在本层，创建顺序由持久化自增序号保证，修改与删除均限定id和所属日期。
