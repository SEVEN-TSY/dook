type Sonner = typeof import('sonner')
type ToastOptions = Parameters<Sonner['toast']['error']>[1]

let toastApi: Sonner['toast'] | undefined
let loading: Promise<Sonner['toast']> | undefined

/** 延迟到真正出现提示时再加载Sonner；加载完成后同步调用，避免提示与清理交错。 */
function withToast(action: (toast: Sonner['toast']) => void) {
  if (toastApi) {
    action(toastApi)
    return
  }
  loading ??= import('sonner').then(({ toast }) => (toastApi = toast))
  void loading.then(action).catch((error) => console.error('提示组件加载失败：', error))
}

export function toastSuccess(message: string, options?: ToastOptions) {
  withToast((toast) => toast.success(message, options))
}

export function toastLoading(message: string, id: string) {
  withToast((toast) => toast.loading(message, { id }))
}

export function toastError(message: string, options?: ToastOptions) {
  withToast((toast) => toast.error(message, options))
}

export function dismissToast(id: string | number) {
  withToast((toast) => toast.dismiss(id))
}
