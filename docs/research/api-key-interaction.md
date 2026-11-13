# API Key配置交互调研

调研日期为2026-11-12。DOOK的DeepSeek设置目前常驻密码输入框，保存后清空输入，测试使用已保存的Key。日报规格要求支持配置、替换、清除和连接测试，重新打开时显示已配置状态。[现有界面](../../src/renderer/src/features/settings/DeepSeekSettings.tsx) · [日报规格](../specs/ai-daily-report.md#7-deepseek接入与凭证)

## 产品实例

- **Cherry Studio**在服务商配置页点「添加API密钥」才弹出输入框，粘贴后可「保存并关闭」，旁边有获取密钥的链接。连接检测是单独操作。密钥管理入口可逐条禁用或删除密钥，适合其多Key场景。[官方配置说明](https://cherryai.com/docs/en/pre-basic/settings/providers/#api-key) · [官方弹窗截图](https://cherryai.com/docs/content-assets/84b3d4a4b6d1af3614f9914e.webp) · [官方密钥管理说明](https://github.com/CherryHQ/cherry-studio-docs/blob/main/pre-basic/settings/providers.md#api-密钥)
- **Open WebUI**通过「添加连接」或已有连接的齿轮进入配置弹窗。用户可以用当前填写的地址和Key请求`/models`验证，再独立保存。连接可停用或删除。[官方验证说明](https://docs.openwebui.com/getting-started/quick-start/connect-a-provider/starting-with-openai-compatible/) · [官方编辑说明](https://docs.openwebui.com/getting-started/quick-start/connect-a-provider/starting-with-open-responses/#step-1-add-or-edit-a-connection) · [官方快速入门](https://docs.openwebui.com/getting-started/quick-start/)
- **TypingMind**的DeepSeek自定义模型在填写认证信息后提供「Test & Save」，用一次提交完成连接验证和模型添加。[官方DeepSeek配置教程与截图](https://www.typingmind.com/guide/deepseek/deepseek-v4-pro)
- **LibreChat**从模型端点旁的齿轮打开「Set API Key」对话框，个人设置另有供应商Key管理和批量移除入口。[官方首次对话指南](https://www.librechat.ai/docs/quick_start/first_chat#give-a-model-an-api-key) · [官方个人设置说明](https://www.librechat.ai/docs/features/settings)

## 套到DOOK的两种做法

- **保存和测试各自独立。**设置行显示「未配置 · 配置」或「已配置 · 测试连接 · 更多」。点击「配置」或「更换API Key」才打开密码输入弹窗，「移除API Key」也放在更多菜单。保存成功立即更新配置状态，测试由用户发起。这个做法沿用现有保存和测试流程，用户也可以在离线时录入Key。
- **验证并保存。**沿用同一设置行，把弹窗主按钮改为「验证并保存」。验证本次输入，成功后写入，失败则在弹窗内保留输入以便重试。更换失败时继续使用旧Key。验证期间需要联网，若复用DOOK现有的生成式测试，可能产生少量API费用。采用此方案需要调整当前规格的保存条件。

两种方案都可以在配置弹窗放「获取API Key」入口。设置行的「已配置」只说明本机已经保存Key，连接结果由单独的测试反馈表达。
