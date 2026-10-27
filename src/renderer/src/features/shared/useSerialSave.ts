import { useRef, useState } from 'react'
import type { RefObject } from 'react'

type SaveStep = 'continue' | 'done' | 'blocked'

/** 同一轮草稿只保留一个保存流程；组合输入结束后继续，失败保留原草稿。 */
export function useSerialSave<T>(
  session: RefObject<T>,
  saveStep: (draft: T) => Promise<SaveStep>,
  report: (message: string) => void,
  failureMessage: string
) {
  const pending = useRef<Promise<boolean> | null>(null)
  const composing = useRef(false)
  const afterComposition = useRef(false)
  const [saving, setSaving] = useState(false)
  const save = (): Promise<boolean> => {
    if (pending.current) return pending.current
    if (composing.current) {
      afterComposition.current = true
      return Promise.resolve(false)
    }
    const draft = session.current
    const run = async () => {
      while (session.current === draft) {
        if (composing.current) {
          afterComposition.current = true
          return false
        }
        const result = await saveStep(draft)
        if (result !== 'continue') return result === 'done'
      }
      return true
    }
    setSaving(true)
    pending.current = run()
      .catch((error: unknown) => {
        report(error instanceof Error ? error.message : failureMessage)
        return false
      })
      .finally(() => {
        pending.current = null
        setSaving(false)
      })
    return pending.current
  }
  const endComposition = () => {
    composing.current = false
    if (afterComposition.current) {
      afterComposition.current = false
      void save()
    }
  }
  const resetComposition = () => {
    composing.current = false
    afterComposition.current = false
  }
  return { save, saving, pending, composing, endComposition, resetComposition }
}
