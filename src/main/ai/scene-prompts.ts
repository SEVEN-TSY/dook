import { AI_PROMPT_MODES } from '../../shared/ai-scene-prompts'
import type { AiScenePrompt, AiScenePromptSettings } from '../../shared/ai-scene-prompts'
import { AiScenePromptStore } from '../storage/ai-scene-prompts'
import type { StoredAiScenePrompts } from '../storage/ai-scene-prompts'

const aiScenePrompts: ReadonlyArray<Omit<AiScenePrompt, 'customPrompt'>> = [
  {
    id: 'daily_report',
    name: '日报',
    defaultPrompt: `按“今日完成”和“待办与持续推进”整理今天的工作，使用简洁、具体的中文。
每项优先用一句话，保留项目名、专有名称和材料中明确的成果。描述同一工作的相关事项可以合并，仍在推进的多天任务逐项呈现。
只有待办描述时，标记为“待完成”。多天任务直接使用记录中的当前进度。缺少明确来源的阻塞和下一步计划省略。

虚构示例
材料
- 已完成「北辰项目」导出异常排查，修复空文件导致的报错。
- 待完成「北辰项目」补充导出回归用例。
- 多天任务「星图」迁移脚本，当前进度60%。

写法示例
今日完成
- 北辰项目：修复导出空文件报错。
待办与持续推进
- 北辰项目：补充导出回归用例（待完成）。
- 星图：迁移脚本持续推进，当前进度60%。`
  },
  {
    id: 'weekly_report',
    name: '周报',
    defaultPrompt: `按项目汇总本周工作，同一项目内合并重复事项，保留关键交付、验证结果和仍在推进的工作。
先说明本周完成了什么，再说明当前进展及已记录的风险、阻塞和下周计划。保留材料中的项目名称、数字和时间范围，缺少依据的内容省略。`
  },
  {
    id: 'monthly_report',
    name: '月报',
    defaultPrompt: `围绕本月阶段成果组织内容，优先列出已交付的里程碑、可核实的影响和可量化的结果。
概括主要工作在月初至月末的变化，合并重复记录，分开表述已交付成果与仍在推进的工作。只使用材料中给出的指标、风险和后续计划。`
  }
]

function requireScene(id: string) {
  const scene = aiScenePrompts.find((scene) => scene.id === id)
  if (!scene) throw new Error('未知的AI场景。')
  return scene
}

function toSettings({ mode, overrides }: StoredAiScenePrompts): AiScenePromptSettings {
  return {
    mode,
    scenes: aiScenePrompts.map((scene) => ({
      ...scene,
      customPrompt: overrides[scene.id] ?? null
    }))
  }
}

export class AiScenePrompts {
  private readonly store: AiScenePromptStore

  constructor(directory: string) {
    this.store = new AiScenePromptStore(directory)
  }

  getSettings(): AiScenePromptSettings {
    return toSettings(this.store.load())
  }

  getEffectivePrompt(id: string): string {
    const scene = requireScene(id)
    const { mode, overrides } = this.store.load()
    return (mode === 'custom' ? overrides[id] : undefined) ?? scene.defaultPrompt
  }

  setMode(mode: string): AiScenePromptSettings {
    const selected = AI_PROMPT_MODES.find((candidate) => candidate === mode)
    if (!selected) throw new Error('提示词模式无效。')
    return this.commit({ ...this.store.load(), mode: selected })
  }

  save(id: string, prompt: string): AiScenePromptSettings {
    requireScene(id)
    if (!prompt.trim()) throw new Error('提示词不能为空，请使用“恢复默认”。')
    const settings = this.store.load()
    settings.overrides[id] = prompt
    return this.commit(settings)
  }

  reset(id?: string): AiScenePromptSettings {
    if (id !== undefined) requireScene(id)
    const settings = this.store.load()
    if (id === undefined) settings.overrides = {}
    else delete settings.overrides[id]
    return this.commit(settings)
  }

  private commit(settings: StoredAiScenePrompts): AiScenePromptSettings {
    this.store.write(settings)
    return toSettings(settings)
  }
}
