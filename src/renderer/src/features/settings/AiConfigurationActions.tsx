import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Pencil, Play, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu'

export function AiConfigurationActions({
  name,
  disabled,
  onTest,
  onEdit,
  onRemove
}: {
  name: string
  disabled: boolean
  onTest: () => void
  onEdit: (trigger: HTMLButtonElement | null) => void
  onRemove: (trigger: HTMLButtonElement | null) => void
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const hover = useRef(false)
  const openingDialog = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  function leave() {
    clearTimeout(closeTimer.current)
    if (hover.current) closeTimer.current = setTimeout(() => setOpen(false), 150)
  }

  return (
    <DropdownMenu
      modal={false}
      open={open && !disabled}
      onOpenChange={(next) => {
        clearTimeout(closeTimer.current)
        setOpen(next)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={`${name}的更多操作`}
          onPointerEnter={(event) => {
            clearTimeout(closeTimer.current)
            if (event.pointerType === 'mouse' && !disabled && !open) {
              hover.current = true
              setOpen(true)
            }
          }}
          onPointerLeave={leave}
          onPointerDown={(event) => {
            if (hover.current && open && event.button === 0) {
              event.preventDefault()
              clearTimeout(closeTimer.current)
            }
            hover.current = false
          }}
          onKeyDown={() => {
            clearTimeout(closeTimer.current)
            hover.current = false
          }}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="ai-configuration-menu w-max min-w-0"
        onPointerEnter={() => clearTimeout(closeTimer.current)}
        onPointerLeave={leave}
        onKeyDown={() => {
          clearTimeout(closeTimer.current)
          hover.current = false
        }}
        onOpenAutoFocus={(event) => {
          if (hover.current) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          if (hover.current || openingDialog.current) event.preventDefault()
          openingDialog.current = false
        }}
        onFocusOutside={(event) => {
          if (hover.current) event.preventDefault()
        }}
      >
        <DropdownMenuItem onSelect={onTest}>
          <Play className="text-inherit" aria-hidden="true" />
          <span>测试</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            openingDialog.current = true
            onEdit(trigger.current)
          }}
        >
          <Pencil className="text-inherit" aria-hidden="true" />
          <span>修改</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="ai-remove-action"
          onSelect={() => {
            openingDialog.current = true
            onRemove(trigger.current)
          }}
        >
          <Trash2 className="text-inherit" aria-hidden="true" />
          <span>移除</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
