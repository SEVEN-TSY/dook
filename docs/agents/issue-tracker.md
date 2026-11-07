# Issue tracker: GitHub

仓库：https://github.com/SEVEN-TSY/dook
任务和规格存放在GitHub Issues，使用`gh`操作。
命令显式指定`--repo SEVEN-TSY/dook`，避免依赖本地remote配置。

## 常用操作

- 创建：`gh issue create --repo SEVEN-TSY/dook --title "<标题>" --body-file <正文文件>`
- 读取：`gh issue view <编号> --repo SEVEN-TSY/dook --json number,title,body,labels,comments`
- 列表：`gh issue list --repo SEVEN-TSY/dook --state open --json number,title,body,labels,assignees`；按需添加`--label`或调整`--state`。
- 评论：`gh issue comment <编号> --repo SEVEN-TSY/dook --body-file <正文文件>`
- 标签：`gh issue edit <编号> --repo SEVEN-TSY/dook --add-label "<标签>"`或`--remove-label "<标签>"`。
- 关闭：`gh issue close <编号> --repo SEVEN-TSY/dook --comment "<原因>"`

多行正文先写入UTF-8文件，再通过`--body-file`传递。
技能要求“发布到issue tracker”时创建Issue；要求“获取相关ticket”时读取对应Issue。

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding operations

- Map：一个带有`wayfinder:map`标签的Issue，正文包含Notes、Decisions-so-far和Fog。
- 子任务：`gh issue create --repo SEVEN-TSY/dook --parent <map编号> --title "<标题>" --body-file <正文文件>`。类型标签使用`wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling`或`wayfinder:task`。
- 不支持子Issue时，在Map任务列表中链接子任务，并在子任务正文开头写`Part of #<map编号>`。
- 阻塞关系：优先使用GitHub原生依赖。先用`gh api repos/SEVEN-TSY/dook/issues/<阻塞任务编号> --jq .id`获取数据库ID，再用`gh api --method POST repos/SEVEN-TSY/dook/issues/<被阻塞任务编号>/dependencies/blocked_by -F issue_id=<数据库ID>`添加依赖。数据库ID与Issue编号、node_id不同。
- 不支持原生依赖时，在子任务正文开头记录`Blocked by: #<编号>, #<编号>`；所有阻塞任务关闭后才可推进。
- Frontier：按Map顺序选择第一个未关闭、无负责人且无未关闭阻塞任务的子任务。原生依赖以`issue_dependencies_summary.blocked_by`为准。
- 领取：`gh issue edit <编号> --repo SEVEN-TSY/dook --add-assignee @me`。
- 完成：先评论结果，再关闭子任务，最后把结论摘要和链接追加到Map的Decisions-so-far。
