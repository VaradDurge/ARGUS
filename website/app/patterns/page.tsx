'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────

interface Candidate {
  id: string
  pattern: string
  match_strategy: string
  proposed_category: string
  severity: string
  description: string
  evidence: string[]
  confidence: number
  reasoning: string
  source_run_ids: string[]
  source_nodes: string[]
  times_seen: number
  first_seen: string
  last_seen: string
  status: string
}

interface CustomSignature {
  id: string
  category: string
  pattern: string
  match_strategy: string
  severity: string
  description: string
  source: string
  metadata: {
    confidence: number | null
    frequency: number | null
    approval_status: string
    approved_at?: string
    framework_specific: string | null
  }
}

type Tab = 'pending' | 'approved'

// ── Constants ────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  critical: { bg: 'rgba(214,92,92,0.08)', border: 'rgba(214,92,92,0.25)', text: '#d65c5c' },
  warning: { bg: 'rgba(212,154,46,0.08)', border: 'rgba(212,154,46,0.25)', text: '#d49a2e' },
}

const STRATEGY_COLORS: Record<string, string> = {
  regex: '#7c7fc7',
  contains_ci: '#3d9e7d',
  exact_ci: '#d49a2e',
  prefix_ci: '#9a6dc6',
  repetition: '#d65c5c',
}

// ── Helpers ──────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

// ── Badge Components ─────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const c = SEVERITY_COLORS[severity] || SEVERITY_COLORS.warning
  return (
    <span
      className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {severity}
    </span>
  )
}

function StrategyBadge({ strategy }: { strategy: string }) {
  const color = STRATEGY_COLORS[strategy] || '#888'
  return (
    <span
      className="text-[10.5px] font-mono font-medium px-2 py-0.5 rounded-md"
      style={{
        background: `${color}10`,
        border: `1px solid ${color}30`,
        color,
      }}
    >
      {strategy}
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className="text-[10.5px] font-medium px-2 py-0.5 rounded-md"
      style={{
        background: 'rgba(124,127,199,0.08)',
        border: '1px solid rgba(124,127,199,0.2)',
        color: 'var(--text-secondary)',
      }}
    >
      {category}
    </span>
  )
}

// ── Candidate Card ───────────────────────────────────────────

function CandidateCard({
  candidate,
  onApprove,
  onReject,
  acting,
}: {
  candidate: Candidate
  onApprove: (id: string) => void
  onReject: (id: string) => void
  acting: boolean
}) {
  const [confirmReject, setConfirmReject] = useState(false)

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <SeverityBadge severity={candidate.severity} />
        <StrategyBadge strategy={candidate.match_strategy} />
        <CategoryBadge category={candidate.proposed_category} />
        <span className="text-[11px] ml-auto" style={{ color: 'var(--text-muted)' }}>
          Seen {candidate.times_seen}x &middot; {timeAgo(candidate.last_seen)}
        </span>
      </div>

      {/* Pattern */}
      <div
        className="rounded-lg px-3.5 py-2.5 font-mono text-[13px] break-all"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
        }}
      >
        {candidate.pattern}
      </div>

      {/* Description */}
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {candidate.description}
      </p>

      {/* Evidence */}
      {candidate.evidence.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span
            className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            Evidence
          </span>
          <div className="flex flex-col gap-1">
            {candidate.evidence.slice(0, 3).map((e, i) => (
              <div
                key={i}
                className="rounded-md px-3 py-1.5 font-mono text-[11.5px] truncate"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                }}
              >
                {e}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reasoning */}
      <p className="text-[12px] italic leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {candidate.reasoning}
      </p>

      {/* Confidence bar */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
          Confidence
        </span>
        <div
          className="flex-1 h-1.5 rounded-full overflow-hidden"
          style={{ background: 'var(--bg-elevated)' }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.round(candidate.confidence * 100)}%`,
              background: candidate.confidence >= 0.8 ? '#3d9e7d' : candidate.confidence >= 0.6 ? '#d49a2e' : '#d65c5c',
            }}
          />
        </div>
        <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {Math.round(candidate.confidence * 100)}%
        </span>
      </div>

      {/* Source info */}
      {candidate.source_run_ids.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            From runs:
          </span>
          {candidate.source_run_ids.slice(0, 3).map((rid) => (
            <span
              key={rid}
              className="text-[10.5px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background: 'rgba(124,127,199,0.08)',
                color: '#7c7fc7',
              }}
            >
              {rid.slice(0, 8)}
            </span>
          ))}
          {candidate.source_run_ids.length > 3 && (
            <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
              +{candidate.source_run_ids.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onApprove(candidate.id)}
          disabled={acting}
          className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
          style={{
            background: '#3d9e7d',
            color: '#fff',
            opacity: acting ? 0.5 : 1,
          }}
        >
          {acting ? 'Saving...' : 'Approve'}
        </button>
        {confirmReject ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Sure?</span>
            <button
              type="button"
              onClick={() => { onReject(candidate.id); setConfirmReject(false) }}
              disabled={acting}
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
              style={{ background: 'rgba(214,92,92,0.12)', color: '#d65c5c' }}
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => setConfirmReject(false)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReject(true)}
            disabled={acting}
            className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
          >
            Reject
          </button>
        )}
      </div>
    </div>
  )
}

// ── Approved Signature Row ───────────────────────────────────

function SignatureRow({
  sig,
  onRemove,
  acting,
}: {
  sig: CustomSignature
  onRemove: (id: string) => void
  acting: boolean
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <span
        className="font-mono text-[11px] font-bold shrink-0"
        style={{ color: '#7c7fc7', minWidth: 48 }}
      >
        {sig.id}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[12.5px] truncate" style={{ color: 'var(--text-primary)' }}>
          {sig.pattern}
        </div>
        <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {sig.description}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <SeverityBadge severity={sig.severity} />
        <StrategyBadge strategy={sig.match_strategy} />
        {sig.metadata.approved_at && (
          <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
            {timeAgo(sig.metadata.approved_at)}
          </span>
        )}
        {confirmRemove ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { onRemove(sig.id); setConfirmRemove(false) }}
              disabled={acting}
              className="px-2 py-1 rounded text-[11px] font-semibold"
              style={{ background: 'rgba(214,92,92,0.12)', color: '#d65c5c' }}
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="px-2 py-1 rounded text-[11px]"
              style={{ color: 'var(--text-muted)' }}
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="text-[11px] px-2 py-1 rounded transition-all"
            style={{ color: 'var(--text-muted)' }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────

export default function PatternsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [signatures, setSignatures] = useState<CustomSignature[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [candRes, sigRes] = await Promise.all([
        fetch('/api/candidates'),
        fetch('/api/custom-signatures'),
      ])
      if (candRes.ok) {
        const data = await candRes.json()
        setCandidates(data.candidates || [])
      }
      if (sigRes.ok) {
        const data = await sigRes.json()
        setSignatures(data || [])
      }
    } catch {
      // local server not running
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleApprove(id: string) {
    setActing(true)
    try {
      const res = await fetch(`/api/candidates/${id}/approve`, { method: 'POST' })
      if (res.ok) {
        await fetchData()
      }
    } catch { /* ignore */ }
    setActing(false)
  }

  async function handleReject(id: string) {
    setActing(true)
    try {
      const res = await fetch(`/api/candidates/${id}/reject`, { method: 'POST' })
      if (res.ok) {
        await fetchData()
      }
    } catch { /* ignore */ }
    setActing(false)
  }

  async function handleRemove(id: string) {
    setActing(true)
    try {
      const res = await fetch(`/api/custom-signatures/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchData()
      }
    } catch { /* ignore */ }
    setActing(false)
  }

  const pendingCount = candidates.length
  const approvedCount = signatures.length

  return (
    <div className="max-w-3xl mx-auto px-8 py-10 overflow-auto h-full">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-[22px] font-bold tracking-tight mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          Learned Patterns
        </h1>
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          AI-discovered failure patterns awaiting review. Approved patterns are loaded by the detection engine automatically.
        </p>
      </div>

      {/* Tabs */}
      <div
        className="flex rounded-lg overflow-hidden mb-5"
        style={{ border: '1px solid var(--border-subtle)', width: 'fit-content' }}
      >
        {(['pending', 'approved'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="px-4 py-2 text-[13px] font-medium transition-all flex items-center gap-1.5"
            style={{
              background: tab === t ? 'rgba(124,127,199,0.1)' : 'transparent',
              color: tab === t ? '#7c7fc7' : 'var(--text-muted)',
            }}
          >
            {t === 'pending' ? 'Pending' : 'Approved'}
            <span
              className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
              style={{
                background: tab === t ? 'rgba(124,127,199,0.15)' : 'var(--bg-elevated)',
                color: tab === t ? '#7c7fc7' : 'var(--text-muted)',
              }}
            >
              {t === 'pending' ? pendingCount : approvedCount}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Loading...
        </div>
      ) : tab === 'pending' ? (
        candidates.length === 0 ? (
          <div
            className="text-center py-16 rounded-xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <p className="text-[14px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              No pending patterns
            </p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Run AI analysis on failing pipelines to discover new failure patterns.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {candidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                onApprove={handleApprove}
                onReject={handleReject}
                acting={acting}
              />
            ))}
          </div>
        )
      ) : signatures.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <p className="text-[14px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            No custom patterns yet
          </p>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Approve candidates from the Pending tab to build your local detection library.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {signatures.map((s) => (
            <SignatureRow
              key={s.id}
              sig={s}
              onRemove={handleRemove}
              acting={acting}
            />
          ))}
        </div>
      )}
    </div>
  )
}
