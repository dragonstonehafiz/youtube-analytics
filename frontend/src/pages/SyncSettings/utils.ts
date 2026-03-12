export type ApiCallRow = {
  total: number
  max: number
  segments: { key: string; color: string; ratio: number; title: string }[]
  legendItems: { key: string; label: string; value: number; color: string }[]
}

export function buildApiCallRow(
  selectedPulls: string[],
  allOptions: { label: string; value: string }[],
  byPull: Record<string, number>,
  max: number,
  pullColors: Record<string, string>,
): ApiCallRow {
  const activePulls =
    selectedPulls.length > 0
      ? selectedPulls.filter((p) => allOptions.some((o) => o.value === p))
      : allOptions.map((o) => o.value)
  const optionLabel = (key: string) => allOptions.find((o) => o.value === key)?.label ?? key
  const total = activePulls.reduce((sum, p) => sum + (byPull[p] ?? 0), 0)
  const visible = activePulls.filter((p) => (byPull[p] ?? 0) > 0)
  return {
    total,
    max,
    segments: visible.map((p) => ({
      key: p,
      color: pullColors[p] ?? '#64748b',
      ratio: max > 0 ? ((byPull[p] ?? 0) / max) * 100 : 0,
      title: `${optionLabel(p)}: ${(byPull[p] ?? 0).toLocaleString()}`,
    })),
    legendItems: visible.map((p) => ({
      key: p,
      label: optionLabel(p),
      value: byPull[p] ?? 0,
      color: pullColors[p] ?? '#64748b',
    })),
  }
}
