export const FALLBACK_ACCENT_COLOR = '#526fc4'

export function normalizeThemeColor(value: unknown): string | undefined {
  if (value === 'system') return value
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
}
