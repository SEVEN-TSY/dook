import type { Task } from '../../../../shared/contracts'

export function taskSummary(tasks: readonly Task[] = [], showMultiDay = true) {
  const included = showMultiDay ? tasks : tasks.filter((task) => task.kind === 'today')
  return {
    total: included.length,
    completed: included.filter((task) => task.completed).length
  }
}
