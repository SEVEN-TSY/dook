import type { CSSProperties } from 'react'
import {
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  Loader2Icon,
  TriangleAlertIcon
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

export function Toaster({ style, ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      duration={3000}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <CircleXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />
      }}
      style={
        {
          '--normal-bg': 'var(--color-popover)',
          '--normal-text': 'var(--color-popover-foreground)',
          '--normal-border': 'var(--color-border)',
          '--border-radius': '0.625rem',
          '--width': 'min(356px, calc(100vw - 32px))',
          ...style
        } as CSSProperties
      }
      {...props}
    />
  )
}
