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
      duration={1500}
      visibleToasts={1}
      richColors
      icons={{
        success: <CircleCheckIcon size={14} />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <CircleXIcon size={14} />,
        loading: <Loader2Icon className="size-4 animate-spin" />
      }}
      style={
        {
          '--normal-bg': 'var(--color-popover)',
          '--normal-text': 'var(--color-popover-foreground)',
          '--normal-border': 'var(--color-border)',
          '--success-bg': 'var(--app-success-surface)',
          '--success-text': 'var(--app-success)',
          '--success-border': 'var(--app-success-border)',
          '--error-bg': 'var(--app-error-surface)',
          '--error-text': 'var(--app-error)',
          '--error-border': 'var(--app-error-border)',
          '--border-radius': '8px',
          '--width': 'min(280px, calc(100vw - 32px))',
          ...style
        } as CSSProperties
      }
      {...props}
    />
  )
}
