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

interface Signature {
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
    contributed_by?: string
    framework_specific: string | null
  }
}

interface FeedbackEvent {
  id: string
  override_type: string
  node_name: string
  anomaly_ids: string[]
  anomaly_reasons: string[]
  llm_reason: string
  llm_confidence: number
  behavior_type: string
  output_shape: { key_count: number; depth: number; total_chars: number }
  source_run_ids: string[]
  times_seen: number
  first_seen: string
  last_seen: string
  status: string
}

type Tab = 'pending' | 'private' | 'shared' | 'feedback'

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

function confidenceColor(c: number): string {
  if (c >= 0.8) return '#3d9e7d'
  if (c >= 0.6) return '#d49a2e'
  return '#d65c5c'
}

// ── Badges ───────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const c = SEVERITY_COLORS[severity] || SEVERITY_COLORS.warning
  return (
    <span
      className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide"
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
      style={{ background: `${color}10`, border: `1px solid ${color}30`, color }}
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

function SourceBadge({ source }: { source: string }) {
  const isShared = source === 'shared'
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide"
      style={{
        background: isShared ? 'rgba(124,127,199,0.08)' : 'rgba(61,158,125,0.08)',
        border: `1px solid ${isShared ? 'rgba(124,127,199,0.2)' : 'rgba(61,158,125,0.2)'}`,
        color: isShared ? '#7c7fc7' : '#3d9e7d',
      }}
    >
      {isShared ? 'shared' : 'private'}
    </span>
  )
}

// ── Candidate Card (Pending Tab) ─────────────────────────────

function CandidateCard({
  candidate,
  onApprovePrivate,
  onApproveShared,
  onReject,
  acting,
}: {
  candidate: Candidate
  onApprovePrivate: (id: string) => void
  onApproveShared: (id: string) => void
  onReject: (id: string) => void
  acting: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const isActing = acting === candidate.id

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${
          candidate.severity === 'critical'
            ? 'rgba(214,92,92,0.2)'
            : 'var(--border-subtle)'
        }`,
      }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={candidate.severity} />
            <StrategyBadge strategy={candidate.match_strategy} />
            <CategoryBadge category={candidate.proposed_category} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-[10.5px] font-mono px-2 py-0.5 rounded-md"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              {candidate.times_seen}x seen
            </span>
            <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
              {timeAgo(candidate.last_seen)}
            </span>
          </div>
        </div>

        {/* Pattern */}
        <div
          className="mt-3 rounded-lg px-4 py-3 font-mono text-[13px] break-all"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
        >
          {candidate.pattern}
        </div>

        {/* Description */}
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {candidate.description}
        </p>

        {/* Confidence */}
        <div className="mt-3 flex items-center gap-3">
          <span className="text-[11px] font-medium shrink-0" style={{ color: 'var(--text-muted)', minWidth: 72 }}>
            Confidence
          </span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round(candidate.confidence * 100)}%`,
                background: confidenceColor(candidate.confidence),
              }}
            />
          </div>
          <span
            className="text-[11px] font-mono font-semibold shrink-0"
            style={{ color: confidenceColor(candidate.confidence) }}
          >
            {Math.round(candidate.confidence * 100)}%
          </span>
        </div>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div className="px-5 py-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {candidate.reasoning && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                LLM Reasoning
              </span>
              <p className="text-[12.5px] leading-relaxed italic" style={{ color: 'var(--text-secondary)' }}>
                {candidate.reasoning}
              </p>
            </div>
          )}
          {candidate.evidence.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Evidence
              </span>
              <div className="flex flex-col gap-1">
                {candidate.evidence.map((e, i) => (
                  <div
                    key={i}
                    className="rounded-md px-3 py-2 font-mono text-[11.5px]"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', wordBreak: 'break-word' }}
                  >
                    {e}
                  </div>
                ))}
              </div>
            </div>
          )}
          {candidate.source_run_ids.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
                Runs:
              </span>
              {candidate.source_run_ids.map((rid) => (
                <span
                  key={rid}
                  className="text-[10.5px] font-mono px-2 py-0.5 rounded-md"
                  style={{ background: 'rgba(124,127,199,0.08)', color: '#7c7fc7' }}
                >
                  {rid.length > 12 ? `${rid.slice(0, 8)}...` : rid}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions footer */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[12px] font-medium transition-colors"
          style={{ color: '#7c7fc7' }}
        >
          {expanded ? 'Show less' : 'Show details'}
        </button>

        <div className="flex items-center gap-2">
          {confirmReject ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Reject?</span>
              <button
                type="button"
                onClick={() => { onReject(candidate.id); setConfirmReject(false) }}
                disabled={isActing}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold"
                style={{ background: 'rgba(214,92,92,0.12)', color: '#d65c5c', opacity: isActing ? 0.5 : 1 }}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmReject(false)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                No
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirmReject(true)}
                disabled={isActing}
                className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', opacity: isActing ? 0.5 : 1 }}
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => onApprovePrivate(candidate.id)}
                disabled={isActing}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-default)',
                  opacity: isActing ? 0.5 : 1,
                }}
                title="Save to your local detection engine only"
              >
                {isActing ? 'Saving...' : 'Private'}
              </button>
              <button
                type="button"
                onClick={() => onApproveShared(candidate.id)}
                disabled={isActing}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all flex items-center gap-1.5"
                style={{ background: '#3d9e7d', color: '#fff', opacity: isActing ? 0.5 : 1 }}
                title="Share with all ARGUS users via cloud sync"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 2v8M4.5 6.5L8 2l3.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2.5 11v1.5a1 1 0 001 1h9a1 1 0 001-1V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                {isActing ? 'Sharing...' : 'Shared'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Signature Row (Private/Shared Tabs) ──────────────────────

function SignatureRow({
  sig,
  onRemove,
  acting,
}: {
  sig: Signature
  onRemove: ((id: string) => void) | null
  acting: boolean
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  return (
    <div
      className="rounded-xl px-5 py-4 flex flex-col gap-2.5"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[11px] font-bold shrink-0" style={{ color: '#7c7fc7', minWidth: 48 }}>
          {sig.id}
        </span>
        <SeverityBadge severity={sig.severity} />
        <StrategyBadge strategy={sig.match_strategy} />
        <SourceBadge source={sig.source} />
        {sig.metadata.contributed_by && (
          <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
            by {sig.metadata.contributed_by}
          </span>
        )}
        <span className="ml-auto text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
          {sig.metadata.approved_at ? timeAgo(sig.metadata.approved_at) : ''}
        </span>
      </div>

      <div
        className="rounded-lg px-3.5 py-2.5 font-mono text-[12.5px] break-all"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
      >
        {sig.pattern}
      </div>

      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {sig.description}
        </p>
        {onRemove && (
          <div className="shrink-0">
            {confirmRemove ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { onRemove(sig.id); setConfirmRemove(false) }}
                  disabled={acting}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold"
                  style={{ background: 'rgba(214,92,92,0.12)', color: '#d65c5c' }}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="px-2.5 py-1 rounded-md text-[11px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="text-[11px] px-2.5 py-1 rounded-md transition-all"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Feedback Card (Feedback Tab) ─────────────────────────────

function FeedbackCard({
  event,
  onResolve,
  onDismiss,
  acting,
}: {
  event: FeedbackEvent
  onResolve: (id: string, verdict: string, share: boolean) => void
  onDismiss: (id: string) => void
  acting: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmAction, setConfirmAction] = useState<string | null>(null)
  const isActing = acting === event.id

  const isAnomaly = event.override_type === 'anomaly_override'

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide"
              style={{
                background: isAnomaly ? 'rgba(212,154,46,0.08)' : 'rgba(124,127,199,0.08)',
                border: `1px solid ${isAnomaly ? 'rgba(212,154,46,0.25)' : 'rgba(124,127,199,0.2)'}`,
                color: isAnomaly ? '#d49a2e' : '#7c7fc7',
              }}
            >
              {isAnomaly ? 'anomaly override' : 'heuristic override'}
            </span>
            {event.anomaly_ids.map((aid) => (
              <span
                key={aid}
                className="text-[10.5px] font-mono font-medium px-2 py-0.5 rounded-md"
                style={{ background: 'rgba(214,92,92,0.08)', border: '1px solid rgba(214,92,92,0.2)', color: '#d65c5c' }}
              >
                {aid}
              </span>
            ))}
            <CategoryBadge category={event.behavior_type} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-[10.5px] font-mono px-2 py-0.5 rounded-md"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              {event.times_seen}x seen
            </span>
            <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
              {timeAgo(event.last_seen)}
            </span>
          </div>
        </div>

        {/* Node name */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Node:</span>
          <span
            className="font-mono text-[13px] font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          >
            {event.node_name}
          </span>
        </div>

        {/* What happened */}
        <div className="mt-3 rounded-lg px-4 py-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <span className="text-[11px] font-semibold shrink-0 mt-0.5" style={{ color: '#d65c5c', minWidth: 80 }}>
                Detector said:
              </span>
              <span className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                {event.anomaly_reasons.join('; ') || 'Suspicious output pattern'}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[11px] font-semibold shrink-0 mt-0.5" style={{ color: '#3d9e7d', minWidth: 80 }}>
                LLM said:
              </span>
              <span className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                {event.llm_reason}
              </span>
            </div>
          </div>
        </div>

        {/* Confidence */}
        <div className="mt-3 flex items-center gap-3">
          <span className="text-[11px] font-medium shrink-0" style={{ color: 'var(--text-muted)', minWidth: 72 }}>
            LLM confidence
          </span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round(event.llm_confidence * 100)}%`,
                background: confidenceColor(event.llm_confidence),
              }}
            />
          </div>
          <span
            className="text-[11px] font-mono font-semibold shrink-0"
            style={{ color: confidenceColor(event.llm_confidence) }}
          >
            {Math.round(event.llm_confidence * 100)}%
          </span>
        </div>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div className="px-5 py-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Output Shape (no content shared)
            </span>
            <div className="flex gap-4">
              {[
                { label: 'Keys', value: event.output_shape.key_count },
                { label: 'Depth', value: event.output_shape.depth },
                { label: 'Chars', value: event.output_shape.total_chars },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-md px-3 py-2" style={{ background: 'var(--bg-elevated)' }}>
                  <span className="text-[10px] block" style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span className="text-[13px] font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
          {event.source_run_ids.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
                Runs:
              </span>
              {event.source_run_ids.map((rid) => (
                <span
                  key={rid}
                  className="text-[10.5px] font-mono px-2 py-0.5 rounded-md"
                  style={{ background: 'rgba(124,127,199,0.08)', color: '#7c7fc7' }}
                >
                  {rid.length > 20 ? `${rid.slice(0, 16)}...` : rid}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions footer */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[12px] font-medium transition-colors"
          style={{ color: '#7c7fc7' }}
        >
          {expanded ? 'Show less' : 'Show details'}
        </button>

        <div className="flex items-center gap-2">
          {confirmAction ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {confirmAction === 'agree' ? 'LLM was right?' : 'Detector was right?'}
              </span>
              <button
                type="button"
                onClick={() => { onResolve(event.id, confirmAction, false); setConfirmAction(null) }}
                disabled={isActing}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', opacity: isActing ? 0.5 : 1 }}
              >
                Local
              </button>
              <button
                type="button"
                onClick={() => { onResolve(event.id, confirmAction, true); setConfirmAction(null) }}
                disabled={isActing}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold flex items-center gap-1"
                style={{ background: '#3d9e7d', color: '#fff', opacity: isActing ? 0.5 : 1 }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 2v8M4.5 6.5L8 2l3.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2.5 11v1.5a1 1 0 001 1h9a1 1 0 001-1V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Share
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-2 py-1.5 rounded-lg text-[12px]"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onDismiss(event.id)}
                disabled={isActing}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                style={{ color: 'var(--text-muted)', opacity: isActing ? 0.5 : 1 }}
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction('disagree')}
                disabled={isActing}
                className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
                style={{
                  color: '#d65c5c',
                  border: '1px solid rgba(214,92,92,0.25)',
                  background: 'rgba(214,92,92,0.06)',
                  opacity: isActing ? 0.5 : 1,
                }}
              >
                Disagree
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction('agree')}
                disabled={isActing}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
                style={{
                  color: '#3d9e7d',
                  border: '1px solid rgba(61,158,125,0.25)',
                  background: 'rgba(61,158,125,0.06)',
                  opacity: isActing ? 0.5 : 1,
                }}
              >
                Agree
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [privateSigs, setPrivateSigs] = useState<Signature[]>([])
  const [sharedSigs, setSharedSigs] = useState<Signature[]>([])
  const [feedbackEvents, setFeedbackEvents] = useState<FeedbackEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [actingBool, setActingBool] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [candRes, privRes, sharedRes, fbRes] = await Promise.all([
        fetch('/api/candidates'),
        fetch('/api/custom-signatures'),
        fetch('/api/shared-signatures'),
        fetch('/api/feedback'),
      ])
      if (candRes.ok) {
        const data = await candRes.json()
        setCandidates(data.candidates || [])
      }
      if (privRes.ok) {
        const data = await privRes.json()
        setPrivateSigs((data || []).map((s: Signature) => ({ ...s, source: s.source || 'learned' })))
      }
      if (sharedRes.ok) {
        const data = await sharedRes.json()
        setSharedSigs((data || []).map((s: Signature) => ({ ...s, source: 'shared' })))
      }
      if (fbRes.ok) {
        const data = await fbRes.json()
        setFeedbackEvents(data.pending || [])
      }
    } catch {
      // server not running
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleApprovePrivate(id: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/candidates/${id}/approve`, { method: 'POST' })
      if (res.ok) await fetchData()
    } catch { /* ignore */ }
    setActing(null)
  }

  async function handleApproveShared(id: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/candidates/${id}/approve-shared`, { method: 'POST' })
      if (res.ok) {
        await fetchData()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed — are you logged in? Run: argus login')
      }
    } catch { /* ignore */ }
    setActing(null)
  }

  async function handleReject(id: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/candidates/${id}/reject`, { method: 'POST' })
      if (res.ok) await fetchData()
    } catch { /* ignore */ }
    setActing(null)
  }

  async function handleRemovePrivate(id: string) {
    setActingBool(true)
    try {
      const res = await fetch(`/api/custom-signatures/${id}`, { method: 'DELETE' })
      if (res.ok) await fetchData()
    } catch { /* ignore */ }
    setActingBool(false)
  }

  async function handleResolveFeedback(id: string, verdict: string, share: boolean) {
    setActing(id)
    try {
      const res = await fetch(`/api/feedback/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict, share }),
      })
      if (res.ok) await fetchData()
    } catch { /* ignore */ }
    setActing(null)
  }

  async function handleDismissFeedback(id: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/feedback/${id}/dismiss`, { method: 'POST' })
      if (res.ok) await fetchData()
    } catch { /* ignore */ }
    setActing(null)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/shared-signatures/sync')
      if (res.ok) await fetchData()
    } catch { /* ignore */ }
    setSyncing(false)
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10 overflow-auto h-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Approvals
          </h1>
          {candidates.length > 0 && (
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(214,92,92,0.12)', color: '#d65c5c' }}
            >
              {candidates.length} pending
            </span>
          )}
        </div>
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          Review AI-discovered patterns and manage your active detection library.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between mb-5">
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--border-subtle)', width: 'fit-content' }}
        >
          {([
            { key: 'pending' as Tab, label: 'Pending', count: candidates.length },
            { key: 'feedback' as Tab, label: 'Feedback', count: feedbackEvents.length },
            { key: 'private' as Tab, label: 'Private', count: privateSigs.length },
            { key: 'shared' as Tab, label: 'Shared', count: sharedSigs.length },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="px-4 py-2 text-[13px] font-medium transition-all flex items-center gap-1.5"
              style={{
                background: tab === key ? 'rgba(124,127,199,0.1)' : 'transparent',
                color: tab === key ? '#7c7fc7' : 'var(--text-muted)',
              }}
            >
              {label}
              <span
                className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                style={{
                  background: tab === key ? 'rgba(124,127,199,0.15)' : 'var(--bg-elevated)',
                  color: tab === key ? '#7c7fc7' : 'var(--text-muted)',
                }}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {tab === 'shared' && (
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              opacity: syncing ? 0.5 : 1,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.5 8a5.5 5.5 0 019.3-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M13.5 8a5.5 5.5 0 01-9.3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M11 3l1 1.5 1.5-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 13l-1-1.5-1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        )}
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
              No pending approvals
            </p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              When the LLM investigator discovers new failure patterns, they appear here for your review.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {candidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                onApprovePrivate={handleApprovePrivate}
                onApproveShared={handleApproveShared}
                onReject={handleReject}
                acting={acting}
              />
            ))}
          </div>
        )
      ) : tab === 'feedback' ? (
        feedbackEvents.length === 0 ? (
          <div
            className="text-center py-16 rounded-xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <p className="text-[14px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              No pending feedback
            </p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              When the LLM judge overrides an anomaly detector flag, it appears here for your review.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {feedbackEvents.map((e) => (
              <FeedbackCard
                key={e.id}
                event={e}
                onResolve={handleResolveFeedback}
                onDismiss={handleDismissFeedback}
                acting={acting}
              />
            ))}
          </div>
        )
      ) : tab === 'private' ? (
        privateSigs.length === 0 ? (
          <div
            className="text-center py-16 rounded-xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <p className="text-[14px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              No private patterns
            </p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Approve pending patterns as &quot;Private&quot; to add them to your local detection engine.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {privateSigs.map((s) => (
              <SignatureRow key={s.id} sig={s} onRemove={handleRemovePrivate} acting={actingBool} />
            ))}
          </div>
        )
      ) : (
        sharedSigs.length === 0 ? (
          <div
            className="text-center py-16 rounded-xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <p className="text-[14px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              No shared patterns
            </p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Approve pending patterns as &quot;Shared&quot; to contribute to the community, or click Sync to pull existing ones.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sharedSigs.map((s) => (
              <SignatureRow key={s.id} sig={s} onRemove={null} acting={false} />
            ))}
          </div>
        )
      )}
    </div>
  )
}
