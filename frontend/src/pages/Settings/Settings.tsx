import { useEffect, useMemo, useState } from 'react'
import { PageCard } from '../../components/cards'
import { ActionButton, Dropdown } from '../../components/ui'
import '../shared.css'
import './Settings.css'

type LlmSchemaOption = {
  label: string
  value: string
}

type LlmSchemaField = {
  key: string
  label: string
  type: 'select' | 'password' | 'number' | 'text'
  options?: LlmSchemaOption[]
  default?: string | number
  required?: boolean
  placeholder?: string
  min?: number
  max?: number
  step?: number
}

type LlmSettingsSchema = {
  provider: string
  title: string
  fields: LlmSchemaField[]
}

type LlmSettingsResponse = {
  provider_name?: string
  model_name?: string
  temperature?: number
  base_url?: string | null
  has_api_key?: boolean
}

type LlmStatusResponse = {
  status?: 'loaded' | 'not_loaded' | 'error'
  model_name?: string
}

function Settings() {
  const [schema, setSchema] = useState<LlmSettingsSchema | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [llmStatus, setLlmStatus] = useState<'loaded' | 'not_loaded' | 'error'>('not_loaded')
  const [hideMonetaryValues, setHideMonetaryValues] = useState(() => {
    const stored = localStorage.getItem('hideMonetaryValues')
    return stored ? JSON.parse(stored) : false
  })
  const [hideVideoTitles, setHideVideoTitles] = useState(() => {
    const stored = localStorage.getItem('hideVideoTitles')
    return stored ? JSON.parse(stored) : false
  })
  const [hideVideoThumbnails, setHideVideoThumbnails] = useState(() => {
    const stored = localStorage.getItem('hideVideoThumbnails')
    return stored ? JSON.parse(stored) : false
  })
  const [hideDescription, setHideDescription] = useState(() => {
    const stored = localStorage.getItem('hideDescription')
    return stored ? JSON.parse(stored) : false
  })

  const loadStatus = async () => {
    const statusResponse = await fetch('http://localhost:8000/llm/status')
    if (!statusResponse.ok) {
      throw new Error(`Failed to load LLM status (${statusResponse.status})`)
    }
    const statusData = (await statusResponse.json()) as LlmStatusResponse
    const nextStatus = statusData.status === 'loaded' ? 'loaded' : statusData.status === 'error' ? 'error' : 'not_loaded'
    setLlmStatus(nextStatus)
  }

  useEffect(() => {
    localStorage.setItem('hideMonetaryValues', JSON.stringify(hideMonetaryValues))
  }, [hideMonetaryValues])

  useEffect(() => {
    localStorage.setItem('hideVideoTitles', JSON.stringify(hideVideoTitles))
  }, [hideVideoTitles])

  useEffect(() => {
    localStorage.setItem('hideVideoThumbnails', JSON.stringify(hideVideoThumbnails))
  }, [hideVideoThumbnails])

  useEffect(() => {
    localStorage.setItem('hideDescription', JSON.stringify(hideDescription))
  }, [hideDescription])

  useEffect(() => {
    async function loadSchemaAndSettings() {
      setLoading(true)
      setError(null)
      try {
        const [schemaResponse, settingsResponse] = await Promise.all([
          fetch('http://localhost:8000/llm/schema'),
          fetch('http://localhost:8000/llm/settings'),
        ])
        if (!schemaResponse.ok) {
          throw new Error(`Failed to load LLM schema (${schemaResponse.status})`)
        }
        if (!settingsResponse.ok) {
          throw new Error(`Failed to load LLM settings (${settingsResponse.status})`)
        }
        await loadStatus()
        const schemaData = (await schemaResponse.json()) as LlmSettingsSchema
        const settingsData = (await settingsResponse.json()) as LlmSettingsResponse
        const nextValues: Record<string, string> = {}
        for (const field of schemaData.fields ?? []) {
          const currentValue = settingsData[field.key as keyof LlmSettingsResponse]
          if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
            nextValues[field.key] = String(currentValue)
            continue
          }
          if (field.default !== undefined && field.default !== null) {
            nextValues[field.key] = String(field.default)
            continue
          }
          nextValues[field.key] = ''
        }
        setSchema(schemaData)
        setFormValues(nextValues)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load LLM settings.')
      } finally {
        setLoading(false)
      }
    }
    loadSchemaAndSettings()
  }, [])

  const fieldList = useMemo(() => schema?.fields ?? [], [schema])

  const setFieldValue = (key: string, value: string) => {
    setFormValues((previous) => ({ ...previous, [key]: value }))
  }

  const saveSettings = async () => {
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, string | number> = {}
      for (const field of fieldList) {
        const rawValue = formValues[field.key] ?? ''
        if (field.required && rawValue.trim().length === 0) {
          throw new Error(`${field.label} is required.`)
        }
        if (rawValue.trim().length === 0) {
          continue
        }
        if (field.type === 'number') {
          const numericValue = Number(rawValue)
          if (Number.isNaN(numericValue)) {
            throw new Error(`${field.label} must be a valid number.`)
          }
          payload[field.key] = numericValue
        } else {
          payload[field.key] = rawValue
        }
      }
      const response = await fetch('http://localhost:8000/llm/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok) {
        throw new Error(typeof body.detail === 'string' ? body.detail : `Failed to save LLM settings (${response.status})`)
      }
      await loadStatus()
      setFormValues((previous) => ({ ...previous, api_key: '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save LLM settings.')
    } finally {
      setSaving(false)
    }
  }

  const renderField = (field: LlmSchemaField) => {
    const value = formValues[field.key] ?? ''
    if (field.type === 'select') {
      return (
        <Dropdown
          items={(field.options ?? []).map((option) => ({
            type: 'option' as const,
            label: option.label,
            value: option.value,
          }))}
          value={value}
          onChange={(nextValue) => setFieldValue(field.key, nextValue)}
          placeholder={field.label}
        />
      )
    }
    return (
      <input
        className="llm-settings-input"
        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(event) => setFieldValue(field.key, event.target.value)}
        placeholder={field.placeholder ?? ''}
        min={field.min}
        max={field.max}
        step={field.step}
      />
    )
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Settings</h1>
      </header>
      <div className="page-body">
        <div className="page-row">
          <PageCard>
            <div className="settings-layout">
              <div className="settings-section">
                <div className="llm-settings-header">
                  <div>
                    <h2 className="llm-settings-title">
                      {schema?.title ?? 'Model Configuration'}
                      <span className={llmStatus === 'loaded' ? 'llm-status-dot llm-status-loaded' : 'llm-status-dot llm-status-not-loaded'} />
                    </h2>
                  </div>
                </div>
                {loading ? <div className="llm-settings-message">Loading settings…</div> : null}
                {!loading && error ? <div className="llm-settings-message llm-settings-message-error">{error}</div> : null}
                {!loading ? (
                  <div className="llm-settings-form">
                    {fieldList.map((field) => (
                      <label className="llm-settings-field" key={field.key}>
                        <span className="llm-settings-label">{field.label}</span>
                        {renderField(field)}
                      </label>
                    ))}
                  </div>
                ) : null}
                <div className="llm-settings-footer">
                  <ActionButton label={saving ? 'Saving...' : 'Save settings'} onClick={saveSettings} disabled={loading || saving} variant="primary" />
                </div>
              </div>

              <div className="settings-divider" />

              <div className="settings-section">
                <h2 className="privacy-mode-title">Privacy Settings</h2>
                <div className="privacy-mode-item">
                  <label className="privacy-mode-toggle">
                    <input
                      type="checkbox"
                      checked={hideMonetaryValues}
                      onChange={(e) => setHideMonetaryValues(e.target.checked)}
                    />
                    <span className="privacy-mode-label">Hide monetary values</span>
                  </label>
                  <label className="privacy-mode-toggle">
                    <input
                      type="checkbox"
                      checked={hideVideoTitles}
                      onChange={(e) => setHideVideoTitles(e.target.checked)}
                    />
                    <span className="privacy-mode-label">Hide video titles</span>
                  </label>
                  <label className="privacy-mode-toggle">
                    <input
                      type="checkbox"
                      checked={hideVideoThumbnails}
                      onChange={(e) => setHideVideoThumbnails(e.target.checked)}
                    />
                    <span className="privacy-mode-label">Hide video thumbnails</span>
                  </label>
                  <label className="privacy-mode-toggle">
                    <input
                      type="checkbox"
                      checked={hideDescription}
                      onChange={(e) => setHideDescription(e.target.checked)}
                    />
                    <span className="privacy-mode-label">Hide descriptions</span>
                  </label>
                </div>
              </div>
            </div>
          </PageCard>
        </div>
      </div>
    </section>
  )
}

export default Settings
