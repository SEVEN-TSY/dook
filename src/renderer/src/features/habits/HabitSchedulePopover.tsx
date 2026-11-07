import { useState } from 'react'
import { CalendarClock, X } from 'lucide-react'
import type { Habit, HabitSchedule } from '../../../../shared/contracts'
import { defaultHabitSchedule } from '../../../../shared/habit-schedule'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '../../components/ui/select'
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover'
import { getDesktopApi, unwrap } from '../../platform/desktop'

export function HabitSchedulePopover({
  habit,
  beforeOpen,
  onSaved,
  disabled
}: {
  habit: Habit
  beforeOpen: () => Promise<boolean>
  onSaved: () => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [schedule, setSchedule] = useState<HabitSchedule>(defaultHabitSchedule)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  return (
    <Popover
      open={open}
      onOpenChange={async (next) => {
        if (saving) return
        if (next && !(await beforeOpen())) return
        if (next) {
          setSchedule(habit.schedule ?? defaultHabitSchedule())
          setError('')
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label="设置定时周期"
          title="设置定时周期"
          data-testid="habit-schedule"
        >
          <CalendarClock size={15} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        showArrow
        sideOffset={6}
        className="action-popover habit-schedule-popover w-[236px] max-w-[calc(100vw-24px)] p-3"
        aria-label="习惯定时周期"
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (saving) return
            setSaving(true)
            try {
              unwrap(await getDesktopApi().setHabitSchedule(habit.id, schedule))
              onSaved()
              setOpen(false)
            } catch (error) {
              setError(error instanceof Error ? error.message : '周期保存失败，请重试。')
            } finally {
              setSaving(false)
            }
          }}
        >
          <div className="action-popover-header">
            <span>定时周期</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="bg-transparent hover:bg-transparent dark:hover:bg-transparent"
              aria-label="关闭定时周期"
              title="关闭定时周期"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              <X size={14} />
            </Button>
          </div>
          <div className="my-3 grid grid-cols-[1fr_136px] items-center gap-3">
            <span>重复周期</span>
            <Select
              disabled={saving}
              value={schedule.kind}
              onValueChange={(value) =>
                setSchedule({
                  kind: value as HabitSchedule['kind'],
                  time: schedule.time,
                  weekdays: schedule.weekdays ?? [1, 2, 3, 4, 5],
                  intervalDays: schedule.intervalDays ?? 2
                })
              }
            >
              <SelectTrigger aria-label="重复周期">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily" data-value="daily">
                  每天
                </SelectItem>
                <SelectItem value="weekly" data-value="weekly">
                  每周
                </SelectItem>
                <SelectItem value="interval" data-value="interval">
                  每隔N天
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {schedule.kind === 'weekly' && (
            <fieldset className="habit-schedule-weekdays my-3 border-0 p-0" disabled={saving}>
              <legend className="mb-2">选择星期</legend>
              <ToggleGroup
                type="multiple"
                variant="outline"
                spacing={0.5}
                disabled={saving}
                className="w-full justify-between gap-0.5"
                aria-label="选择星期"
                value={(schedule.weekdays ?? []).map(String)}
                onValueChange={(days) => setSchedule({ ...schedule, weekdays: days.map(Number) })}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <ToggleGroupItem
                    key={day}
                    value={String(day)}
                    className="size-7 rounded-full px-0 text-xs shadow-none data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary-hover data-[state=on]:hover:text-primary-foreground"
                    aria-label={`星期${'一二三四五六日'[day - 1]}`}
                  >
                    {'一二三四五六日'[day - 1]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </fieldset>
          )}
          {schedule.kind === 'interval' && (
            <label className="my-3 grid grid-cols-[1fr_136px] items-center gap-3">
              间隔天数
              <Input
                className="text-xs shadow-none focus-visible:ring-0"
                type="number"
                aria-label="间隔天数"
                min={1}
                max={365}
                required
                disabled={saving}
                value={schedule.intervalDays ?? 2}
                onChange={(event) =>
                  setSchedule({ ...schedule, intervalDays: Number(event.target.value) })
                }
              />
            </label>
          )}
          <div className="my-3 grid grid-cols-[1fr_136px] items-center gap-3">
            <span>生成时间</span>
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label="生成时间"
              data-time={schedule.time}
            >
              {(['hour', 'minute'] as const).map((part, index) => (
                <Select
                  key={part}
                  disabled={saving}
                  value={schedule.time.split(':')[index]}
                  onValueChange={(value) => {
                    const time = schedule.time.split(':')
                    time[index] = value
                    setSchedule({ ...schedule, time: time.join(':') })
                  }}
                >
                  {index === 1 && <span aria-hidden="true">:</span>}
                  <SelectTrigger aria-label={part === 'hour' ? '生成小时' : '生成分钟'}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: part === 'hour' ? 24 : 60 }, (_, value) =>
                      String(value).padStart(2, '0')
                    ).map((value) => (
                      <SelectItem key={value} value={value} data-value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
            </div>
          </div>
          {error && (
            <p className="habit-schedule-error my-2 text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="habit-schedule-footer flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
