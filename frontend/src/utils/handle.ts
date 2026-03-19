export function formatHandle(value: string | null | undefined): string {
  if (!value || !value.trim()) {
    return '@Unknown'
  }
  const trimmed = value.trim()
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
}
