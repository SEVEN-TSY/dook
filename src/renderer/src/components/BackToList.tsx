import { ArrowLeft } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Button } from './ui/button'

export function BackToList(props: Omit<ComponentProps<typeof Button>, 'children'>) {
  return (
    <Button {...props} type="button" variant="ghost" className="detail-back" aria-label="返回列表">
      <ArrowLeft aria-hidden="true" size={16} />
      返回列表
    </Button>
  )
}
