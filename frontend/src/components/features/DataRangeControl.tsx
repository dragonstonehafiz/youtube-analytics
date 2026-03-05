import { useEffect, useRef, useState } from 'react'
import DateRangePicker from '../ui/DateRangePicker'
import Dropdown from '../ui/Dropdown'
import { useAnalyticsDateRange, GRANULARITY_OPTIONS, type RangeMode } from '../../hooks/useAnalyticsDateRange'
import { getStored, setStored } from '../../utils/storage'

type OptionItem = { label: string; value: string }

type SecondaryControl = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  items: OptionItem[]
}

export type DateRangeValue = {
  range: { start: string; end: string }
  previousRange: { start: string; end: string; daySpan: number }
  granularity: 'daily' | '7d' | '28d' | '90d' | 'monthly' | 'yearly'
}

type DataRangeControlProps = {
  storageKey: string
  granularityOptions?: OptionItem[]
  defaultGranularity?: string
  defaultPreset?: string
  defaultMode?: RangeMode
  years?: string[]
  secondaryControl?: SecondaryControl
  presetPlaceholder?: string
  onChange: (value: DateRangeValue) => void
}

function DataRangeControl({
  storageKey,
  granularityOptions = GRANULARITY_OPTIONS,
  defaultGranularity = 'daily',
  defaultPreset,
  defaultMode,
  years: externalYears,
  secondaryControl,
  presetPlaceholder = 'Full data',
  onChange,
}: DataRangeControlProps) {
  const {
    years,
    mode, setMode,
    presetSelection, setPresetSelection,
    yearSelection, setYearSelection,
    monthSelection, setMonthSelection,
    customStart, setCustomStart,
    customEnd, setCustomEnd,
    range,
    previousRange,
    rangeOptions,
  } = useAnalyticsDateRange({ storageKey, defaultPreset, defaultMode, years: externalYears })

  const [granularity, setGranularity] = useState<DateRangeValue['granularity']>(
    () => getStored(`${storageKey}_granularity`, defaultGranularity) as DateRangeValue['granularity']
  )

  useEffect(() => {
    setStored(`${storageKey}_granularity`, granularity)
  }, [storageKey, granularity])

  // Ref-stabilised callback so the effect doesn't need onChange in its dep array
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  useEffect(() => {
    onChangeRef.current({ range, previousRange, granularity })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, previousRange.start, previousRange.end, granularity])

  return (
    <>
      <Dropdown
        value={granularity}
        onChange={(v) => setGranularity(v as DateRangeValue['granularity'])}
        placeholder="Daily"
        items={granularityOptions.map((item) => ({ type: 'option' as const, ...item }))}
      />
      {secondaryControl ? (
        <Dropdown
          value={secondaryControl.value}
          onChange={secondaryControl.onChange}
          placeholder={secondaryControl.placeholder}
          items={secondaryControl.items.map((item) => ({ type: 'option' as const, ...item }))}
        />
      ) : null}
      <Dropdown
        value={mode}
        onChange={(value) => setMode(value as RangeMode)}
        placeholder="Presets"
        items={[
          { type: 'option' as const, label: 'Presets', value: 'presets' },
          { type: 'option' as const, label: 'Yearly', value: 'year' },
          { type: 'option' as const, label: 'Custom range', value: 'custom' },
        ]}
      />
      {mode === 'presets' ? (
        <Dropdown
          value={presetSelection}
          onChange={setPresetSelection}
          placeholder={presetPlaceholder}
          items={rangeOptions.map((option) => ({ type: 'option' as const, ...option }))}
        />
      ) : null}
      {mode === 'year' ? (
        <>
          <Dropdown
            value={yearSelection}
            onChange={setYearSelection}
            placeholder="Select year"
            items={years.map((item) => ({ type: 'option' as const, label: item, value: item }))}
          />
          <Dropdown
            value={monthSelection}
            onChange={setMonthSelection}
            placeholder="All months"
            items={[
              { type: 'option' as const, label: 'All months', value: 'all' },
              { type: 'option' as const, label: 'January', value: '1' },
              { type: 'option' as const, label: 'February', value: '2' },
              { type: 'option' as const, label: 'March', value: '3' },
              { type: 'option' as const, label: 'April', value: '4' },
              { type: 'option' as const, label: 'May', value: '5' },
              { type: 'option' as const, label: 'June', value: '6' },
              { type: 'option' as const, label: 'July', value: '7' },
              { type: 'option' as const, label: 'August', value: '8' },
              { type: 'option' as const, label: 'September', value: '9' },
              { type: 'option' as const, label: 'October', value: '10' },
              { type: 'option' as const, label: 'November', value: '11' },
              { type: 'option' as const, label: 'December', value: '12' },
            ]}
          />
        </>
      ) : null}
      {mode === 'custom' ? (
        <DateRangePicker
          startDate={customStart}
          endDate={customEnd}
          onChange={(s, e) => { setCustomStart(s); setCustomEnd(e) }}
        />
      ) : null}
    </>
  )
}

export type { DataRangeControlProps, RangeMode, OptionItem, SecondaryControl }
export default DataRangeControl
