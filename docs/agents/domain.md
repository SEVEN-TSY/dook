# Domain docs

采用single-context布局：根目录的`GLOSSARY.md`保存领域术语，`docs/adr/`保存架构决策。

## 阅读规则

- 探索代码前读取根目录的`GLOSSARY.md`，以及`docs/adr/`中与当前工作有关的ADR。
- 若根目录存在`GLOSSARY-MAP.md`，按其中的映射读取相关上下文的术语表，同时检查`src/<context>/docs/adr/`中的相关决策。
- 文件缺失时直接继续；术语和决策实际明确后，由domain-modeling技能按需创建。
- Issue标题、重构建议、假设和测试名称使用术语表中的领域用词。缺少必要概念时，先确认项目已有用词，再记录待建模的术语缺口。
- 提议与现有ADR冲突时，明确指出ADR编号、冲突内容及重新讨论的理由。
