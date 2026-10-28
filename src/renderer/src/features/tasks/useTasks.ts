import { useCallback, useEffect, useRef, useState } from 'react'
import type { Task, TodayTasks } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'

export function useTasks() {
  const [today, setToday] = useState<TodayTasks | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++generation.current
    try {
      const result = unwrap(await getDesktopApi().listToday())
      if (request === generation.current) setToday(result)
    } catch (error) {
      if (request === generation.current)
        setError(error instanceof Error ? error.message : '读取任务失败。')
    }
  }, [])
  useEffect(() => {
    let unsubscribe = () => {}
    try {
      unsubscribe = getDesktopApi().onTasksChanged(() => {
        void refresh()
      })
    } catch (error) {
      setError(error instanceof Error ? error.message : '桌面桥接不可用。')
    }
    void refresh()
    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      unsubscribe()
      generation.current++
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (pending.current) return false
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await action()
      await refresh()
      return true
    } catch (error) {
      setError(error instanceof Error ? error.message : '操作失败，请重试。')
      await refresh()
      return false
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return {
    today,
    error,
    busy,
    setError,
    refresh,
    pin: (task: Task) =>
      run(async () => unwrap(await getDesktopApi().setTaskPinned(task.id, !task.pinned))),
    move: (id: string, targetId: string, before: boolean) =>
      run(async () => unwrap(await getDesktopApi().moveTask(id, targetId, before))),
    complete: (task: Task) =>
      run(async () => unwrap(await getDesktopApi().setTaskCompleted(task.id, !task.completed))),
    convert: (id: string) => run(async () => unwrap(await getDesktopApi().convertToMultiDay(id))),
    addHabit: (id: string) =>
      run(async () => unwrap(await getDesktopApi().createHabitFromTask(id))),
    progress: async (id: string, value: number) => {
      try {
        unwrap(await getDesktopApi().setTaskProgress(id, value))
        setError('')
        await refresh()
      } catch (error) {
        setError(error instanceof Error ? error.message : '更新进度失败。')
        await refresh()
      }
    },
    skipHabit: (id: string) => run(async () => unwrap(await getDesktopApi().skipHabitTask(id))),
    remove: (id: string) => run(async () => unwrap(await getDesktopApi().deleteTask(id)))
  }
}
