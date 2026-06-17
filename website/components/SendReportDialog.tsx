'use client'

import { useState, useEffect } from 'react'

type ReportCategory = 'bug' | 'setup_issue' | 'unexpected_result'

interface DoctorInfo {
  argus_version: string
  python: { passed: boolean; message: string }
  langgraph: { passed: boolean; message: string }
  storage: { passed: boolean; message: string }
  replay: { passed: boolean; message: string }
  optional_deps: { passed: boolean; message: string }
}

const CATEGORIES: { value: ReportCategory; label: string; icon: string }[] = [
  { value: 'bug', label: 'Bug', icon: '\uD83D\uDC1B' },
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
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [doctorInfo, setDoctorInfo] = useState<DoctorInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCategory(null)
      setDescription('')
      setIncludeRun(!!runId)
      setSubmitted(false)
      setError(null)
      // Fetch doctor info for preview
      fetch('/api/doctor')
        .then(r => r.json())
        .then(setDoctorInfo)
        .catch(() => {})
    }
  }, [open, runId])

  if (!open) return null

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
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setSubmitted(true)
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
              <div className="flex gap-2">
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
