import { useEffect, useRef } from 'react'
import {
  Archive,
  ArrowDownLeft,
  ArrowUpLeft,
  MoreHorizontal,
  Pin,
  PinOff,
  Repeat,
  SkipForward
} from 'lucide-react'
import type { Task } from '../../../../shared/contracts'
import { useDeleteConfirmation } from '../../components/DeleteConfirmation'
import { Button } from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu'
import type { useTasks } from './useTasks'

type TaskActions = ReturnType<typeof useTasks>

/** 任务行更多菜单只在主界面的任务列表出现，独立成块避免便签启动加载Radix菜单。 */
export function TaskMenu({
  task,
  tasks,
  busy,
  open,
  showMultiDay,
  flush,
  onOpenChange,
  onConvert,
  onConvertedToToday
}: {
  task: Task
  tasks: TaskActions
  busy: boolean
  open: boolean
  showMultiDay: boolean
  flush: () => Promise<boolean>
  onOpenChange: (open: boolean) => void
  onConvert: (task: Task) => void
  onConvertedToToday: (task: Task) => void
}) {
  const deletion = useDeleteConfirmation()
  const hoverMenu = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const keepMenu = () => clearTimeout(closeTimer.current)
  const leaveMenu = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      if (open) onOpenChange(false)
    }, 180)
  }
  useEffect(() => () => clearTimeout(closeTimer.current), [])
  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        keepMenu()
        hoverMenu.current = false
        onOpenChange(next)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="task-more"
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') {
              keepMenu()
              if (!open) {
                hoverMenu.current = true
                onOpenChange(true)
              }
            }
          }}
          onPointerLeave={leaveMenu}
          onPointerDown={() => {
            hoverMenu.current = false
          }}
          onKeyDown={() => {
            hoverMenu.current = false
          }}
          disabled={busy}
          aria-label={`更多操作：${task.description}`}
          title="更多操作"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="[&_[role=menuitem]:is(:hover,[data-highlighted]):not([data-disabled])>svg]:text-primary"
        onOpenAutoFocus={(event) => {
          if (hoverMenu.current) event.preventDefault()
        }}
        onKeyDown={() => {
          hoverMenu.current = false
        }}
        onPointerDown={() => {
          hoverMenu.current = false
        }}
        onPointerEnter={keepMenu}
        onPointerLeave={leaveMenu}
        onCloseAutoFocus={(event) => {
          if (hoverMenu.current) event.preventDefault()
        }}
        onFocusOutside={(event) => {
          if (hoverMenu.current) event.preventDefault()
        }}
      >
        {showMultiDay && task.kind === 'multi-day' && (
          <DropdownMenuItem
            onSelect={() => {
              void (async () => {
                if (await flush()) {
                  const hasSubitems = Boolean(task.subitems?.length)
                  const trigger = document.querySelector<HTMLElement>(
                    `[data-task-id="${task.id}"] .task-more`
                  )
                  if (
                    hasSubitems &&
                    !(await deletion.confirm(
                      {
                        title: '转回这就去做',
                        description: '转回当天任务会丢失所有子事项。',
                        detail: `“${task.description}”的全部${task.subitems?.length}个子事项将被删除，无法恢复。是否继续？`,
                        confirmLabel: '确认转回'
                      },
                      trigger
                    ))
                  )
                    return
                  if (await tasks.convertToday(task.id, hasSubitems)) onConvertedToToday(task)
                }
              })()
            }}
          >
            <ArrowUpLeft aria-hidden="true" />
            转回这就去做
          </DropdownMenuItem>
        )}
        {task.kind === 'today' && !task.habitId && (
          <>
            {!task.completed && showMultiDay && (
              <DropdownMenuItem
                data-testid="task-convert"
                onSelect={() => {
                  void onConvert(task)
                }}
              >
                <ArrowDownLeft aria-hidden="true" />
                转为持续推进
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              data-testid="task-to-habit"
              onSelect={() => {
                void (async () => {
                  if (await flush()) await tasks.addHabit(task.id)
                })()
              }}
            >
              <Repeat aria-hidden="true" />
              添加为习惯
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onSelect={() => {
            void (async () => {
              if (await flush()) await tasks.pin(task)
            })()
          }}
        >
          {task.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
          {task.pinned ? '取消置顶' : '置顶任务'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="task-delete"
          onSelect={() => {
            void (async () => {
              if (await flush()) {
                if (task.habitId) await tasks.skipHabit(task.id)
                else await tasks.archive(task.id)
              }
            })()
          }}
        >
          {task.habitId ? <SkipForward aria-hidden="true" /> : <Archive aria-hidden="true" />}
          {task.habitId ? '暂停一次' : '归档任务'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
