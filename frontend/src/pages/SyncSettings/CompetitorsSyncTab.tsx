import { useEffect, useMemo, useState } from 'react'
import { ActionButton, TextInput } from '../../components/ui'
import { RatioBar } from '../../components/charts'
import { formatWholeNumber } from '../../utils/number'
import type { ProgressState } from './SyncSettings'

type CompetitorConfig = { label: string; channel_id: string; enabled: boolean; row_count?: number }

type Props = {
  isSyncActive: boolean
  isStopPending: boolean
  onStopSync: () => void
  onSetIsSyncing: (v: boolean) => void
  onSetProgress: (p: ProgressState) => void
}

function CompetitorsSyncTab({
  isSyncActive,
  isStopPending,
  onStopSync,
  onSetIsSyncing,
  onSetProgress,
}: Props) {
  const [competitorsConfig, setCompetitorsConfig] = useState<Record<string, CompetitorConfig>>({})
  const [apiCallsLoading, setApiCallsLoading] = useState(false)
  const [apiCallsError, setApiCallsError] = useState<string | null>(null)
  const [apiCalls, setApiCalls] = useState(0)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('http://localhost:8000/competitors')
        const data = await response.json()
        setCompetitorsConfig(data || {})
      } catch (error) {
        console.error('Failed to load competitors', error)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const save = async () => {
      try {
        await fetch('http://localhost:8000/competitors', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(competitorsConfig),
        })
      } catch (error) {
        console.error('Failed to save competitors', error)
      }
    }
    if (Object.keys(competitorsConfig).length > 0) {
      save()
    }
  }, [competitorsConfig])

  useEffect(() => {
    const enabledCount = Object.values(competitorsConfig).filter((c) => c.enabled).length
    if (enabledCount === 0) {
      setApiCalls(0)
      return
    }
    let active = true
    async function load() {
      setApiCallsLoading(true)
      setApiCallsError(null)
      try {
        const response = await fetch('http://localhost:8000/competitors')
        if (!response.ok) throw new Error(`Request failed (${response.status})`)
        const data = await response.json()
        if (active) {
          const enabledCompetitors = Object.values(data as Record<string, CompetitorConfig>).filter(
            (c) => c.enabled,
          )
          setApiCalls(enabledCompetitors.length * 4)
        }
      } catch (error) {
        if (active) {
          setApiCallsError(error instanceof Error ? error.message : 'Failed to load estimate')
        }
      } finally {
        if (active) setApiCallsLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [competitorsConfig])

  const apiCallRow = useMemo(() => {
    return {
      total: apiCalls,
      max: 10000,
      segments:
        apiCalls > 0
          ? [
              {
                key: 'competitors',
                color: '#a78bfa',
                ratio: Math.min(100, (apiCalls / 10000) * 100),
                title: `Competitors: ${apiCalls.toLocaleString()}`,
              },
            ]
          : [],
      legendItems:
        apiCalls > 0
          ? [{ key: 'competitors', label: 'Competitors', value: apiCalls, color: '#a78bfa' }]
          : [],
    }
  }, [apiCalls])

  const addCompetitor = () => {
    const timestamp = Date.now()
    setCompetitorsConfig((prev) => ({
      ...prev,
      [`competitor_${timestamp}`]: { label: '', channel_id: '', enabled: true, row_count: 0 },
    }))
  }

  const removeCompetitor = async (index: number) => {
    const entries = Object.entries(competitorsConfig)
    if (index < 0 || index >= entries.length) return
    const [key, config] = entries[index]
    const channel_id = config.channel_id

    try {
      await fetch(`http://localhost:8000/competitors/${channel_id}`, { method: 'DELETE' })
    } catch (error) {
      console.error('Failed to delete competitor videos', error)
    }

    setCompetitorsConfig((prev) => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
  }

  const updateCompetitor = (
    index: number,
    field: 'label' | 'channel_id' | 'enabled',
    value: string | boolean,
  ) => {
    const entries = Object.entries(competitorsConfig)
    if (index < 0 || index >= entries.length) return
    const [key, config] = entries[index]
    setCompetitorsConfig((prev) => ({
      ...prev,
      [key]: { ...config, [field]: value },
    }))
  }

  const refreshData = async () => {
    try {
      const response = await fetch('http://localhost:8000/competitors')
      const data = await response.json()
      setCompetitorsConfig(data || {})
    } catch (error) {
      console.error('Failed to refresh competitors data', error)
    }
  }

  const handleSync = async () => {
    const enabledCount = Object.values(competitorsConfig).filter((c) => c.enabled).length
    if (enabledCount === 0) {
      alert('No competitors enabled')
      return
    }
    onSetIsSyncing(true)
    onSetProgress({
      is_syncing: true,
      current_step: 0,
      max_steps: 0,
      message: 'Starting competitors sync…',
      stop_requested: false,
    })
    try {
      await fetch('http://localhost:8000/sync/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('Failed to start competitors sync', error)
    } finally {
      onSetIsSyncing(false)
    }
  }

  return (
    <div className="sync-card">
      <div className="sync-card-header-row">
        <div className="sync-card-header">Competitors Sync</div>
        <span className="sync-api-badge">YouTube Data API v3</span>
        <ActionButton label="Refresh" onClick={refreshData} variant="soft" />
        <ActionButton label="Add" onClick={addCompetitor} variant="soft" />
        <ActionButton
          label={isSyncActive ? (isStopPending ? 'Stopping...' : 'Stop sync') : 'Start sync'}
          onClick={isSyncActive ? onStopSync : handleSync}
          disabled={isStopPending}
          variant={isSyncActive ? 'danger' : 'primary'}
        />
      </div>
      <table className="sync-table">
        <thead>
          <tr>
            <th style={{ width: 200 }}>Channel Name</th>
            <th style={{ width: 200 }}>Channel ID</th>
            <th style={{ width: 120 }}>Row Count</th>
            <th style={{ width: 60 }}>Include</th>
            <th style={{ width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(competitorsConfig).map(([key, config], index) => (
            <tr key={key}>
              <td>
                <TextInput
                  value={config.label}
                  onChange={(v) => updateCompetitor(index, 'label', v)}
                  placeholder="Channel name"
                  disableNewlines
                  width="100%"
                  height="36px"
                />
              </td>
              <td>
                <TextInput
                  value={config.channel_id}
                  onChange={(v) => updateCompetitor(index, 'channel_id', v)}
                  placeholder="Channel ID"
                  disableNewlines
                  width="100%"
                  height="36px"
                />
              </td>
              <td className="sync-row-count">{formatWholeNumber(config.row_count || 0)} rows</td>
              <td>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => updateCompetitor(index, 'enabled', e.target.checked)}
                />
              </td>
              <td>
                <ActionButton
                  label="Delete"
                  onClick={() => removeCompetitor(index)}
                  variant="danger"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sync-estimate-section">
        {apiCallsLoading ? (
          <div className="sync-estimate-meta">Loading...</div>
        ) : apiCallsError ? (
          <div className="sync-estimate-meta">{apiCallsError}</div>
        ) : (
          <div className="sync-estimate-bar-row">
            <div className="sync-estimate-bar-header">
              <span className="sync-estimate-api-label">Estimate YouTube Data API v3 API Calls</span>
              <span>{`${apiCallRow.total.toLocaleString()} / ${apiCallRow.max.toLocaleString()}`}</span>
            </div>
            <RatioBar length="100%" ratio={100} color="#94a3b8" segments={apiCallRow.segments} />
            <div className="sync-estimate-legend">
              {apiCallRow.legendItems.map((item) => (
                <div key={item.key} className="sync-estimate-legend-item">
                  <span className="sync-estimate-legend-dot" style={{ backgroundColor: item.color }} />
                  <span className="sync-estimate-legend-label">{item.label}</span>
                  <span className="sync-estimate-legend-value">{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CompetitorsSyncTab
