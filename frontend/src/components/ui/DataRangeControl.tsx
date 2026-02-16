import DateRangePicker from './DateRangePicker'
import Dropdown from './Dropdown'

type RangeMode = 'presets' | 'year' | 'custom'
type OptionItem = { label: string; value: string }

type SecondaryControl = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  items: OptionItem[]
}

type DataRangeControlProps = {
  granularity: string
  onGranularityChange: (value: string) => void
  mode: RangeMode
  onModeChange: (value: RangeMode) => void
  presetSelection: string
  onPresetSelectionChange: (value: string) => void
  yearSelection: string
  onYearSelectionChange: (value: string) => void
  monthSelection: string
  onMonthSelectionChange: (value: string) => void
  customStart: string
  customEnd: string
  onCustomRangeChange: (startDate: string, endDate: string) => void
  years: string[]
  rangeOptions: OptionItem[]
  granularityOptions: OptionItem[]
  secondaryControl?: SecondaryControl
  presetPlaceholder?: string
}

function DataRangeControl({
  granularity,
  onGranularityChange,
  mode,
  onModeChange,
  presetSelection,
  onPresetSelectionChange,
  yearSelection,
  onYearSelectionChange,
  monthSelection,
  onMonthSelectionChange,
  customStart,
  customEnd,
  onCustomRangeChange,
  years,
  rangeOptions,
  granularityOptions,
  secondaryControl,
  presetPlaceholder = 'Full data',
}: DataRangeControlProps) {
  return (
    <>
      <Dropdown
        value={granularity}
        onChange={onGranularityChange}
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
        onChange={(value) => onModeChange(value as RangeMode)}
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
          onChange={onPresetSelectionChange}
          placeholder={presetPlaceholder}
          items={rangeOptions.map((option) => ({ type: 'option' as const, ...option }))}
        />
      ) : null}
      {mode === 'year' ? (
        <>
          <Dropdown
            value={yearSelection}
            onChange={onYearSelectionChange}
            placeholder="Select year"
            items={years.map((item) => ({ type: 'option' as const, label: item, value: item }))}
          />
          <Dropdown
            value={monthSelection}
            onChange={onMonthSelectionChange}
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
          onChange={onCustomRangeChange}
        />
      ) : null}
    </>
  )
}

export type { DataRangeControlProps, RangeMode, OptionItem, SecondaryControl }
export default DataRangeControl
