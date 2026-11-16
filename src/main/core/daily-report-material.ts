import { z } from 'zod'
import type { Task } from '../../shared/contracts'
import { dailyReportBodyLimit } from '../../shared/daily-report'

const length = (value: string) => Array.from(value).length

export function reportMaterial(
  tasks: Task[],
  delta: (id: string, mode: 'manual' | 'subitems') => number | undefined
) {
  if (tasks.length > 100) throw new Error('日报最多可发送100项任务。')
  let total = 0
  const description = (value: string) => {
    const size = length(value)
    if (size > 2000) throw new Error('日报中的每条任务或子事项描述最多2000字。')
    total += size
    if (total > 16000) throw new Error('日报的任务及子事项描述合计最多16000字。')
    return value
  }
  return tasks.map((task, index) => {
    const id = index + 1
    const ongoing = task.kind === 'multi-day' && !task.completed
    const children = task.subitems ?? []
    return {
      id,
      description: description(task.description),
      kind: task.kind,
      habit: Boolean(task.habitId),
      completed: task.completed,
      sections: task.completed ? ['today'] : ongoing ? ['today', 'tomorrow'] : ['tomorrow'],
      progress: ongoing ? task.progress : null,
      todayProgressDelta: ongoing
        ? (delta(task.id, children.length ? 'subitems' : 'manual') ?? null)
        : null,
      subitemTotal: children.length,
      subitemCompleted: children.filter((item) => item.completed).length,
      subitems: children
        .filter((item) => !item.completed)
        .map((item, childIndex) => ({
          id: `${id}.${childIndex + 1}`,
          description: description(item.description)
        }))
    }
  })
}

const singleLine = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/[\r\n\u2028\u2029]/u.test(value))
const item = z.object({
  sourceIds: z.array(z.number().int().positive()).min(1).max(100),
  subitemIds: z.array(z.string()).max(100).optional(),
  text: singleLine.refine((value) => length(value) <= 500)
})
const section = z.object({ title: singleLine, items: z.array(item).max(100) })
const response = z.object({ today: section, tomorrow: section })

const progressMark =
  /[（(]\s*(\d+)\s*[/／]\s*(\d+)\s*[)）]|(?:完成|进度)\s*(\d+)\s*(?:[/／]\s*(\d+)|[%％])/u

export function renderDailyReport(content: string, material: ReturnType<typeof reportMaterial>) {
  const invalid = () => new Error('AI返回的日报正文或材料来源无效，请重新生成。')
  if (Buffer.byteLength(content) > 64 * 1024) throw invalid()
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    throw invalid()
  }
  const parsed = response.safeParse(raw)
  if (!parsed.success) throw invalid()
  if (!parsed.data.today.items.length && !parsed.data.tomorrow.items.length) {
    if (material.every((task) => task.habit))
      throw new Error('AI未从习惯任务中选出可用于日报的工作内容。')
    throw invalid()
  }
  const lines = (['today', 'tomorrow'] as const).map((name) => {
    const { title, items } = parsed.data[name]
    const used = new Set<number>()
    return [
      title,
      ...items.map((item) => {
        const sources = item.sourceIds.map((id) => {
          const source = material[id - 1]
          if (!source || !source.sections.includes(name) || used.has(id)) throw invalid()
          used.add(id)
          return source
        })
        const children = new Set(sources.flatMap((source) => source.subitems.map(({ id }) => id)))
        const usedChildren = new Set<string>()
        for (const id of item.subitemIds ?? []) {
          if (!children.has(id) || usedChildren.has(id)) throw invalid()
          usedChildren.add(id)
        }
        const ongoing = sources.find((source) => source.progress !== null)
        if (ongoing && sources.length !== 1) throw invalid()
        const text = item.text
        if (ongoing && name === 'today') {
          const mark = text.match(progressMark)
          if (mark) {
            const count = Number(mark[1] ?? mark[3])
            const total = mark[2] ?? mark[4]
            const matches =
              total === undefined
                ? count === ongoing.progress
                : ongoing.subitemTotal > 0 &&
                  count === ongoing.subitemCompleted &&
                  Number(total) === ongoing.subitemTotal
            if (!matches) throw invalid()
          }
        }
        return text
      })
    ].join('\n')
  })
  const body = lines.join('\n\n')
  if (length(body) > dailyReportBodyLimit) throw invalid()
  return body
}
