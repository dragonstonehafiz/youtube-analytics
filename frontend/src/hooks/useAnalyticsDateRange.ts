import { useEffect, useMemo, useState } from 'react'
import { getStored, setStored } from '../utils/storage'

export type RangeMode = 'presets' | 'year' | 'custom'
export type DateRange = { start: string; end: string }
export type PreviousDateRange = { start: string; end: string; daySpan: number }

type StoredRange = {
  mode?: RangeMode
  presetSelection?: string
  yearSelection?: string
  monthSelection?: string
  customStart?: string
  customEnd?: string
}

export type UseAnalyticsDateRangeOptions = {
  /** localStorage key to persist/restore the range state */
  storageKey: string
  /** Default preset value, e.g. 'range:28d' or 'full' */
  defaultPreset?: string
  /** Default mode */
  defaultMode?: RangeMode
  /**
   * Available years to populate the year picker. Provide via fetchChannelYears() or
   * fetchVideoYears() from utils/years. When updated, yearSelection auto-initialises
   * to the first entry if not already set.
   */
  years?: string[]
}

/** Standard range presets shared across all analytics pages */
export const RANGE_OPTIONS = [
  { label: 'Last 7 days', value: 'range:7d' },
  { label: 'Last 28 days', value: 'range:28d' },
  { label: 'Last 90 days', value: 'range:90d' },
  { label: 'Last 365 days', value: 'range:365d' },
  { label: 'Full data', value: 'full' },
]

/** Standard granularity options shared across all analytics pages */
export const GRANULARITY_OPTIONS = [
  { label: 'Daily', value: 'daily' },
  { label: '7-days', value: '7d' },
  { label: '28-days', value: '28d' },
  { label: '90-days', value: '90d' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
]

export function useAnalyticsDateRange({
  storageKey,
  defaultPreset = 'full',
  defaultMode = 'presets',
  years: externalYears,
}: UseAnalyticsDateRangeOptions) {
  const storedRange = getStored(storageKey, null as StoredRange | null)
  const today = new Date().toISOString().slice(0, 10)

  const [years, setYears] = useState<string[]>([])
  const [mode, setMode] = useState<RangeMode>(storedRange?.mode ?? defaultMode)
  const [presetSelection, setPresetSelection] = useState(storedRange?.presetSelection ?? defaultPreset)
  const [yearSelection, setYearSelection] = useState(storedRange?.yearSelection ?? '')
  const [monthSelection, setMonthSelection] = useState(storedRange?.monthSelection ?? 'all')
  const [customStart, setCustomStart] = useState(storedRange?.customStart ?? today)
  const [customEnd, setCustomEnd] = useState(storedRange?.customEnd ?? today)

  // Sync external years into internal state; auto-initialise yearSelection when years first arrive
  useEffect(() => {
    if (!externalYears || externalYears.length === 0) return
    setYears(externalYears)
    setYearSelection((prev) => (prev ? prev : externalYears[0]))
  }, [externalYears])

  // Auto-set year selection when switching to year mode
  useEffect(() => {
    if (mode === 'year' && !yearSelection && years.length > 0) {
      setYearSelection(years[0])
    }
  }, [mode, yearSelection, years])

  // Persist range state to localStorage
  useEffect(() => {
    setStored(storageKey, { mode, presetSelection, yearSelection, monthSelection, customStart, customEnd })
  }, [storageKey, mode, presetSelection, yearSelection, monthSelection, customStart, customEnd])

  const range = useMemo((): DateRange => {
    const now = new Date()
    const utcToday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    const format = (value: Date) => value.toISOString().slice(0, 10)
    if (mode === 'presets') {
      if (presetSelection.startsWith('range:')) {
        const days = parseInt(presetSelection.split(':')[1].replace('d', ''), 10)
        const start = new Date(utcToday)
        start.setUTCDate(start.getUTCDate() - (days - 1))
        return { start: format(start), end: format(utcToday) }
      }
      if (presetSelection === 'full') {
        if (years.length > 0) {
          const parsed = years.map((value) => parseInt(value, 10)).filter((value) => !Number.isNaN(value))
          const minYear = Math.min(...parsed)
          const maxYear = Math.max(...parsed)
          return { start: `${minYear}-01-01`, end: `${maxYear}-12-31` }
        }
        return { start: format(utcToday), end: format(utcToday) }
      }
    }
    if (mode === 'year' && yearSelection) {
      const year = parseInt(yearSelection, 10)
      if (!Number.isNaN(year)) {
        if (monthSelection === 'all') {
          return { start: `${year}-01-01`, end: `${year}-12-31` }
        }
        const month = parseInt(monthSelection, 10)
        if (!Number.isNaN(month)) {
          const start = new Date(Date.UTC(year, month - 1, 1))
          const end = new Date(Date.UTC(year, month, 0))
          return { start: format(start), end: format(end) }
        }
        return { start: `${year}-01-01`, end: `${year}-12-31` }
      }
    }
    if (mode === 'custom') {
      return { start: customStart, end: customEnd }
    }
    return { start: format(utcToday), end: format(utcToday) }
  }, [mode, presetSelection, yearSelection, monthSelection, customStart, customEnd, years])

  const previousRange = useMemo((): PreviousDateRange => {
    const start = new Date(`${range.start}T00:00:00Z`)
    const end = new Date(`${range.end}T00:00:00Z`)
    const daySpan = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1)
    const previousEnd = new Date(start)
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
    const previousStart = new Date(previousEnd)
    previousStart.setUTCDate(previousStart.getUTCDate() - (daySpan - 1))
    return {
      start: previousStart.toISOString().slice(0, 10),
      end: previousEnd.toISOString().slice(0, 10),
      daySpan,
    }
  }, [range.start, range.end])

  return {
    years,
    mode,
    setMode,
    presetSelection,
    setPresetSelection,
    yearSelection,
    setYearSelection,
    monthSelection,
    setMonthSelection,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    range,
    previousRange,
    rangeOptions: RANGE_OPTIONS,
  }
}
