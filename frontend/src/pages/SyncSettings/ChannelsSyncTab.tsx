import { useEffect, useMemo, useState } from 'react'
import { ActionButton, TextInput } from '../../components/ui'
import { formatWholeNumber } from '../../utils/number'
import SyncEstimatePanel from './SyncEstimatePanel'
import SyncTabHeader from './SyncTabHeader'

type ChannelConfig = {
  label: string
  channel_id: string
  enabled: boolean
  row_count?: number
  thumbnail_url?: string
}

type Props = {
  isSyncActive: boolean
  isStopPending: boolean
  onStopSync: () => void
  onStartSyncRequest: (message: string, request: () => Promise<void>) => Promise<void>
  initialConfig: Record<string, ChannelConfig>
}

function ChannelsSyncTab({
  isSyncActive,
  isStopPending,
  onStopSync,
  onStartSyncRequest,
  initialConfig,
}: Props) {
  const [channelsConfig, setChannelsConfig] = useState<Record<string, ChannelConfig>>(initialConfig)
  const [apiCalls, setApiCalls] = useState(0)

  useEffect(() => {
    setChannelsConfig(initialConfig)
  }, [initialConfig])

  useEffect(() => {
    const save = async () => {
      try {
        await fetch('http://localhost:8000/channels', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(channelsConfig),
        })
      } catch (error) {
        console.error('Failed to save channels', error)
      }
    }
    if (Object.keys(channelsConfig).length > 0) {
      save()
    }
  }, [channelsConfig])

  useEffect(() => {
    const fetchEstimate = async () => {
      try {
        // Get only enabled channels
        const enabledChannels = Object.values(channelsConfig).filter((c) => c.enabled && c.channel_id)

        if (enabledChannels.length === 0) {
          setApiCalls(0)
          return
        }

        const enabledIds = enabledChannels.map((c) => c.channel_id).join(',')
        const url = new URL('http://localhost:8000/sync/estimate/channels')
        url.searchParams.set('channel_ids', enabledIds)

        const response = await fetch(url)
        if (response.ok) {
          const data = await response.json()
          setApiCalls(data.total || 0)
        }
      } catch (error) {
        console.error('Failed to fetch channels estimate', error)
      }
    }
    fetchEstimate()
  }, [channelsConfig])

  const apiCallRow = useMemo(() => {
    return {
      total: apiCalls,
      max: 10000,
      segments:
        apiCalls > 0
          ? [
              {
                key: 'channels',
                color: '#a78bfa',
                ratio: Math.min(100, (apiCalls / 10000) * 100),
                title: `Channels: ${apiCalls.toLocaleString()}`,
              },
            ]
          : [],
      legendItems:
        apiCalls > 0
          ? [{ key: 'channels', label: 'Channels', value: apiCalls, color: '#a78bfa' }]
          : [],
    }
  }, [apiCalls])

  const addChannel = () => {
    const channelId = prompt('Enter Channel ID:')
    if (channelId && channelId.trim()) {
      setChannelsConfig((prev) => ({
        ...prev,
        [channelId]: { label: '', channel_id: channelId, enabled: true, row_count: 0, thumbnail_url: undefined },
      }))
    }
  }

  const removeChannel = async (index: number) => {
    const entries = Object.entries(channelsConfig)
    if (index < 0 || index >= entries.length) return
    const [key, config] = entries[index]
    const channel_id = config.channel_id

    if (channel_id) {
      try {
        await fetch(`http://localhost:8000/channels/${channel_id}`, { method: 'DELETE' })
      } catch (error) {
        console.error('Failed to delete channel', error)
      }
    }

    setChannelsConfig((prev) => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
  }

  const updateChannel = (
    index: number,
    field: 'channel_id' | 'enabled',
    value: string | boolean,
  ) => {
    const entries = Object.entries(channelsConfig)
    if (index < 0 || index >= entries.length) return
    const [key, config] = entries[index]
    setChannelsConfig((prev) => ({
      ...prev,
      [key]: { ...config, [field]: value },
    }))
  }

  const refreshData = async () => {
    try {
      const response = await fetch('http://localhost:8000/channels')
      const data = await response.json()
      // Preserve enabled state for each channel
      const merged = Object.entries(data || {}).reduce((acc, [key, channel]) => {
        acc[key] = {
          ...channel,
          enabled: channelsConfig[key]?.enabled ?? false,
        }
        return acc
      }, {} as Record<string, ChannelConfig>)
      setChannelsConfig(merged)
    } catch (error) {
      console.error('Failed to refresh channels data', error)
    }
  }

  const handleSync = async () => {
    const enabledChannels = Object.values(channelsConfig).filter((c) => c.enabled && c.channel_id)
    if (enabledChannels.length === 0) {
      alert('No channels enabled')
      return
    }
    const enabledIds = enabledChannels.map((c) => c.channel_id)
    await onStartSyncRequest('Starting channels sync…', async () => {
      await fetch('http://localhost:8000/sync/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_ids: enabledIds }),
      })
    })
  }

  return (
    <div className="sync-card">
      <SyncTabHeader
        title="Channels Sync"
        apiBadge="YouTube Data API v3"
        isSyncActive={isSyncActive}
        isStopPending={isStopPending}
        onStopSync={onStopSync}
        onStartSync={handleSync}
        onRefresh={refreshData}
      >
        <ActionButton label="Add" onClick={addChannel} variant="soft" />
      </SyncTabHeader>
      <table className="sync-table">
        <colgroup>
          <col />
          <col />
          <col />
          <col />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th>Channel Name</th>
            <th>Channel ID</th>
            <th>Row Count</th>
            <th>Include</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(channelsConfig).map(([key, config], index) => (
            <tr key={key}>
              <td>
                {config.thumbnail_url && (
                  <img
                    src={config.thumbnail_url}
                    alt={config.label}
                    style={{ width: '36px', height: '36px', borderRadius: '4px' }}
                  />
                )}
              </td>
              <td>{config.label}</td>
              <td>
                <TextInput
                  value={config.channel_id}
                  onChange={(v) => updateChannel(index, 'channel_id', v)}
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
                  onChange={(e) => updateChannel(index, 'enabled', e.target.checked)}
                />
              </td>
              <td>
                <ActionButton
                  label="Delete"
                  onClick={() => removeChannel(index)}
                  variant="danger"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SyncEstimatePanel
        loading={false}
        error={null}
        apiLabel="Estimate YouTube Data API v3 API Calls"
        apiCallRow={apiCallRow}
      />
    </div>
  )
}

export default ChannelsSyncTab
