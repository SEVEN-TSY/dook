import { toast } from 'sonner'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Task, TodayTasks } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'

export function useTasks() {
  const [today, setToday] = useState<TodayTasks | null>(null)
  const [archived, setArchived] = useState<Task[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++generation.current
    try {
      const [result, archiveResult] = await Promise.all([
        getDesktopApi().listToday(),
        getDesktopApi().listArchivedTasks()
      ])
      const nextToday = unwrap(result)
      const nextArchived = unwrap(archiveResult)
      if (request === generation.current) {
        setToday(nextToday)
        setArchived(nextArchived)
      }
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
      toast.success('操作成功')
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
    archived,
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
    convertToday: (id: string, discardSubitems = false) =>
      run(async () => unwrap(await getDesktopApi().convertToToday(id, discardSubitems))),
    convert: (id: string) => run(async () => unwrap(await getDesktopApi().convertToMultiDay(id))),
    addHabit: (id: string) =>
      run(async () => unwrap(await getDesktopApi().createHabitFromTask(id))),
    progress: async (id: string, value: number) => {
      try {
        unwrap(await getDesktopApi().setTaskProgress(id, value))
        setError('')
        toast.success('进度已更新')
        await refresh()
        return true
      } catch (error) {
        setError(error instanceof Error ? error.message : '更新进度失败。')
        await refresh()
        return false
      }
    },
    skipHabit: (id: string) => run(async () => unwrap(await getDesktopApi().skipHabitTask(id))),
    archive: (id: string) => run(async () => unwrap(await getDesktopApi().archiveTask(id))),
    restore: (id: string) => run(async () => unwrap(await getDesktopApi().restoreTask(id))),
    deleteArchived: (id: string) =>
      run(async () => unwrap(await getDesktopApi().deleteArchivedTask(id))),
    remove: (id: string) => run(async () => unwrap(await getDesktopApi().deleteTask(id)))
  }
}
