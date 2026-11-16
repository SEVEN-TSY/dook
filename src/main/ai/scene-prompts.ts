import { AI_PROMPT_MODES } from '../../shared/ai-scene-prompts'
import type {
  AiPromptMode,
  AiScenePrompt,
  AiScenePromptSettings
} from '../../shared/ai-scene-prompts'
import { AiScenePromptStore } from '../storage/ai-scene-prompts'

const aiScenePrompts: ReadonlyArray<Omit<AiScenePrompt, 'customPrompt' | 'customPromptPath'>> = [
  {
    id: 'daily_report',
    name: '日报',
    defaultPrompt: `## 用途
根据任务记录起草可直接填入企业日报的中文报工内容。
固定分为“今日工作内容”和“明日工作计划”。每条独占一行，由应用按节编号。

## 条数偏好
今日工作内容期望条数3条，明日工作计划期望条数2条，通常控制在4条和3条以内。
先判断哪些事项值得单独汇报，根据实际任务内容决定条数，不要捏造和迎合期望数量。

## 今日工作内容
先列已完成工作，优先写明确交付物、验证结果或关键数量。
优先汇报工作日常，省略与工作无关的生活习惯。
重复记录合为一条。实际工时按明确记录填入。仅有任务描述时，写清做了什么即可。
本次材料包含多天任务时，可在完成项后补充值得汇报的未完成多天任务，写“进度N%”。
已完成的多天任务只写工作和成果。

## 明日工作计划
从未完成事项中提炼具体的后续动作，如“继续补充导出回归用例”。
本次材料包含多天任务时，以任务写明的明日目标为先，其余在已有进度上加上当天净增量。
无子事项写“完成N%”，有子事项时按照可继续完成的具体条目写“完成N/M”，由应用计算。
缺少可用增量和明确目标时，写“继续”加上有依据的动作或原事项。
本次材料只有今天任务时，从未完成的普通今天任务提炼明日计划。

## 表达方式
直接写动作和结果、状态或目标。项目名、模块名在有助于理解时自然写进句子。
每条尽量一句话，省去开场、套话、括号和结语。`
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
  },
  {
    id: 'inspiration_collection',
    name: '小记归集',
    defaultPrompt:
      '按主题整理选定的小记。给每组起一个具体名称，归纳共同观点和有用细节，保留原文中的分歧。无法归类的内容单独列出。'
  },
  {
    id: 'reminder',
    name: '每日提示',
    defaultPrompt: `根据昨天的任务完成情况，为今天给出简短、可执行的规划建议。
优先从昨天未完成或仍在推进的事项中挑出今天值得继续做的任务，每项建议给出具体的下一步。用昨天已完成的事项判断后续工作，只在记录明确有后续时提及。
保留任务名称和已记录的进度。根据明确的截止时间、优先级或依赖关系排序，缺少依据时省略对应说明。没有足够的昨日记录时，简短说明情况。`
  }
]

function requireScene(id: string) {
  const scene = aiScenePrompts.find((scene) => scene.id === id)
  if (!scene) throw new Error('未知的AI场景。')
  return scene
}

export class AiScenePrompts {
  private readonly store: AiScenePromptStore

  constructor(directory: string) {
    this.store = new AiScenePromptStore(directory)
  }

  getSettings(): AiScenePromptSettings {
    return this.readSettings(this.store.loadMode())
  }

  getEffectivePrompt(id: string): string {
    const scene = requireScene(id)
    const mode = this.store.loadMode()
    return (mode === 'custom' ? this.store.loadPrompt(id) : null) ?? scene.defaultPrompt
  }

  setMode(mode: string): AiScenePromptSettings {
    const selected = AI_PROMPT_MODES.find((candidate) => candidate === mode)
    if (!selected) throw new Error('提示词模式无效。')
    const settings = this.getSettings()
    this.store.writeMode(selected)
    return { ...settings, mode: selected }
  }

  save(id: string, prompt: string): AiScenePromptSettings {
    requireScene(id)
    if (!prompt.trim()) throw new Error('提示词不能为空，请使用“恢复默认”。')
    const settings = this.getSettings()
    this.store.writePrompt(id, prompt)
    return {
      ...settings,
      scenes: settings.scenes.map((scene) =>
        scene.id === id
          ? { ...scene, customPrompt: prompt, customPromptPath: this.store.promptPath(id) }
          : scene
      )
    }
  }

  reset(id: string): AiScenePromptSettings {
    requireScene(id)
    const mode = this.store.loadMode()
    this.store.reset(id)
    return this.readSettings(mode)
  }

  private readSettings(mode: AiPromptMode): AiScenePromptSettings {
    return {
      mode,
      scenes: aiScenePrompts.map((scene) => {
        const customPrompt = this.store.loadPrompt(scene.id)
        return {
          ...scene,
          customPrompt,
          customPromptPath: customPrompt === null ? null : this.store.promptPath(scene.id)
        }
      })
    }
  }
}
