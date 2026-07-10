'use client'

import { useState, useEffect } from 'react'

type ReportCategory = 'bug' | 'feature' | 'improvement' | 'setup_issue' | 'unexpected_result'

interface DoctorInfo {
  argus_version: string
  python: { passed: boolean; message: string }
  langgraph: { passed: boolean; message: string }
  storage: { passed: boolean; message: string }
  replay: { passed: boolean; message: string }
  optional_deps: { passed: boolean; message: string }
}

interface Settings {
  linear_api_key_set: boolean
  linear_team_id: string
  linear_team_name: string
  discord_webhook_set: boolean
  discord_webhook_masked: string
}

interface LinearIssue {
  id: string
  identifier: string
  url: string
  title: string
}

const CATEGORIES: { value: ReportCategory; label: string; icon: string }[] = [
  { value: 'bug', label: 'Bug', icon: '\uD83D\uDC1B' },
  { value: 'feature', label: 'Feature', icon: '\u2728' },
  { value: 'improvement', label: 'Improvement', icon: '\uD83D\uDCA1' },
  { value: 'setup_issue', label: 'Setup Issue', icon: '\uD83D\uDD27' },
  { value: 'unexpected_result', label: 'Unexpected Result', icon: '\uD83E\uDD14' },
]

export default function SendReportDialog({
  open,
  onClose,
  runId,
}: {
  open: boolean
  onClose: () => void
  runId?: string | null
}) {
  const [category, setCategory] = useState<ReportCategory | null>(null)
  const [description, setDescription] = useState('')
  const [includeRun, setIncludeRun] = useState(!!runId)
  const [sendToLinear, setSendToLinear] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [doctorInfo, setDoctorInfo] = useState<DoctorInfo | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [linearIssue, setLinearIssue] = useState<LinearIssue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showWebhookInput, setShowWebhookInput] = useState(false)
  const [webhookInput, setWebhookInput] = useState('')
  const [savingWebhook, setSavingWebhook] = useState(false)

  useEffect(() => {
    if (open) {
      setCategory(null)
      setDescription('')
      setIncludeRun(!!runId)
      setSendToLinear(false)
      setSubmitted(false)
      setLinearIssue(null)
      setError(null)
      setShowWebhookInput(false)
      setWebhookInput('')
      fetch('/api/doctor')
        .then(r => r.json())
        .then(setDoctorInfo)
        .catch(() => {})
      fetch('/api/settings')
        .then(r => r.json())
        .then((data: Settings) => {
          setSettings(data)
          if (data.linear_api_key_set && data.linear_team_id) {
            setSendToLinear(true)
          }
        })
        .catch(() => {})
    }
  }, [open, runId])

  if (!open) return null

  const linearConfigured = settings?.linear_api_key_set && settings?.linear_team_id
  const discordConfigured = settings?.discord_webhook_set

  async function saveWebhook() {
    if (!webhookInput.trim()) return
    setSavingWebhook(true)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discord_webhook: webhookInput.trim() }),
      })
      setSettings(prev => prev ? { ...prev, discord_webhook_set: true, discord_webhook_masked: '••••' + webhookInput.trim().slice(-8) } : prev)
      setShowWebhookInput(false)
      setWebhookInput('')
    } catch { /* best effort */ }
    setSavingWebhook(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!category || !description.trim()) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description: description.trim(),
          run_id: runId || null,
          include_run: includeRun && !!runId,
          send_to_linear: sendToLinear && linearConfigured,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setSubmitted(true)
        if (data.linear) {
          setLinearIssue(data.linear)
        }
      } else {
        setError(data.error || 'Failed to send report')
      }
    } catch {
      setError('Network error — could not send report')
    }

    setSubmitting(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            Send Diagnostic Report
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[18px] leading-none px-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
          >
            &times;
          </button>
        </div>

        {submitted ? (
          <div className="px-5 py-10 text-center">
            <div className="text-[28px] mb-3">&#x2705;</div>
            <p className="text-[14px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Report sent
            </p>
            {discordConfigured && (
              <p className="text-[12px] mb-1" style={{ color: '#5865F2' }}>
                Sent to Discord
              </p>
            )}
            {linearIssue && (
              <div className="mb-3 mt-2 rounded-lg px-4 py-3 text-left" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Linear Issue Created
                </p>
                <a
                  href={linearIssue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-medium hover:underline"
                  style={{ color: '#7c7fc7' }}
                >
                  {linearIssue.identifier} — {linearIssue.title?.slice(0, 60)}
                </a>
              </div>
            )}
            <p className="text-[12px] mb-5" style={{ color: 'var(--text-secondary)' }}>
              We&apos;ll review this and follow up if needed.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-medium"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => {
                  const active = category === cat.value
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(active ? null : cat.value)}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5"
                      style={{
                        background: active ? 'rgba(124,127,199,0.1)' : 'transparent',
                        border: `1px solid ${active ? '#7c7fc7' : 'var(--border-subtle)'}`,
                        color: active ? '#7c7fc7' : 'var(--text-muted)',
                      }}
                    >
                      <span>{cat.icon}</span>
                      {cat.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                What happened?
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe what went wrong, what you expected, and any steps to reproduce..."
                rows={4}
                maxLength={2000}
                className="w-full rounded-lg px-3.5 py-2.5 text-[13px] outline-none resize-none"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
                required
              />
            </div>

            {/* Include run toggle */}
            {runId && (
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeRun}
                  onChange={e => setIncludeRun(e.target.checked)}
                  className="rounded"
                  style={{ accentColor: '#7c7fc7' }}
                />
                <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                  Include run diagnostics for{' '}
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text-primary)' }}>
                    {runId.slice(0, 20)}...
                  </span>
                </span>
              </label>
            )}

            {/* Send to Linear toggle */}
            {linearConfigured && (
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendToLinear}
                  onChange={e => setSendToLinear(e.target.checked)}
                  className="rounded"
                  style={{ accentColor: '#7c7fc7' }}
                />
                <span className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Create Linear issue
                  {settings?.linear_team_name && (
                    <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                      {settings.linear_team_name}
                    </span>
                  )}
                </span>
              </label>
            )}

            {/* Discord webhook status */}
            <div className="flex items-center gap-2.5">
              <span
                className="size-2 rounded-full"
                style={{ background: discordConfigured ? '#5865F2' : 'var(--border-default)' }}
              />
              <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                {discordConfigured ? 'Discord notifications enabled' : 'Discord not configured'}
              </span>
              {!discordConfigured && !showWebhookInput && (
                <button
                  type="button"
                  onClick={() => setShowWebhookInput(true)}
                  className="text-[11px] font-medium px-2 py-0.5 rounded"
                  style={{ color: '#5865F2', background: 'rgba(88,101,242,0.1)' }}
                >
                  Add webhook
                </button>
              )}
            </div>

            {showWebhookInput && (
              <div className="flex gap-2">
                <input
                  type="url"
                  value={webhookInput}
                  onChange={e => setWebhookInput(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="flex-1 rounded-lg px-3 py-1.5 text-[12px] font-mono outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={saveWebhook}
                  disabled={!webhookInput.trim() || savingWebhook}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                  style={{ background: '#5865F2', color: '#fff', opacity: !webhookInput.trim() || savingWebhook ? 0.5 : 1 }}
                >
                  {savingWebhook ? '...' : 'Save'}
                </button>
              </div>
            )}

            {/* Preview — what will be sent */}
            <div className="rounded-lg px-3.5 py-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                What will be sent
              </p>
              <div className="flex flex-col gap-1 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                <div className="flex items-center gap-1.5">
                  <span style={{ color: '#22c55e' }}>&#x2713;</span> System info (Python, LangGraph, ARGUS version)
                </div>
                <div className="flex items-center gap-1.5">
                  <span style={{ color: '#22c55e' }}>&#x2713;</span> Storage health &amp; optional deps status
                </div>
                {runId && includeRun && (
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: '#22c55e' }}>&#x2713;</span> Run topology, node statuses, errors (no input/output data)
                  </div>
                )}
                {discordConfigured && (
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: '#5865F2' }}>&#x2713;</span> Discord notification
                  </div>
                )}
                {sendToLinear && linearConfigured && (
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: '#5e6ad2' }}>&#x2713;</span> Linear issue with label &quot;{category ? CATEGORIES.find(c => c.value === category)?.label || category : '...'}&quot;
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span style={{ color: '#ef4444' }}>&#x2717;</span>
                  <span style={{ color: 'var(--text-muted)' }}>No pipeline data, API keys, or credentials</span>
                </div>
              </div>
              {doctorInfo && (
                <div className="mt-2.5 pt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] font-mono" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <span>argus {doctorInfo.argus_version}</span>
                  <span>{doctorInfo.python?.message}</span>
                  <span>{doctorInfo.langgraph?.message}</span>
                </div>
              )}
            </div>

            {error && (
              <p className="text-[12px]" style={{ color: '#ef4444' }}>{error}</p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={!category || !description.trim() || submitting}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
                style={{
                  background: '#7c7fc7',
                  color: '#fff',
                  opacity: (!category || !description.trim() || submitting) ? 0.5 : 1,
                }}
              >
                {submitting ? 'Sending...' : 'Send Report'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-[13px] font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
