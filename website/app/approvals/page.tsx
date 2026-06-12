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

type FilterSeverity = 'all' | 'critical' | 'warning'
type SortBy = 'newest' | 'oldest' | 'confidence' | 'frequency'

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

// ── Badge Components ─────────────────────────────────────────

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

// ── Approval Card ────────────────────────────────────────────

function ApprovalCard({
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
      {/* Card header */}
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
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-muted)',
              }}
            >
              {candidate.times_seen}x seen
            </span>
            <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
              {timeAgo(candidate.last_seen)}
            </span>
          </div>
        </div>

        {/* Pattern display */}
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
        <p
          className="mt-3 text-[13px] leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {candidate.description}
        </p>

        {/* Confidence bar */}
        <div className="mt-3 flex items-center gap-3">
          <span
            className="text-[11px] font-medium shrink-0"
            style={{ color: 'var(--text-muted)', minWidth: 72 }}
          >
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
        <div
          className="px-5 py-4 flex flex-col gap-3"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          {/* Reasoning */}
          {candidate.reasoning && (
            <div>
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.1em] block mb-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                LLM Reasoning
              </span>
              <p
                className="text-[12.5px] leading-relaxed italic"
                style={{ color: 'var(--text-secondary)' }}
              >
                {candidate.reasoning}
              </p>
            </div>
          )}

          {/* Evidence */}
          {candidate.evidence.length > 0 && (
            <div>
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.1em] block mb-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Evidence
              </span>
              <div className="flex flex-col gap-1">
                {candidate.evidence.map((e, i) => (
                  <div
                    key={i}
                    className="rounded-md px-3 py-2 font-mono text-[11.5px]"
                    style={{
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)',
                      wordBreak: 'break-word',
                    }}
                  >
                    {e}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Source runs */}
          {candidate.source_run_ids.length > 0 && (
            <div>
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.1em] block mb-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Source Runs
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {candidate.source_run_ids.map((rid) => (
                  <span
                    key={rid}
                    className="text-[10.5px] font-mono px-2 py-1 rounded-md"
                    style={{
                      background: 'rgba(124,127,199,0.08)',
                      border: '1px solid rgba(124,127,199,0.15)',
                      color: '#7c7fc7',
                    }}
                  >
                    {rid.length > 12 ? `${rid.slice(0, 8)}...` : rid}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source nodes */}
          {candidate.source_nodes.length > 0 && (
            <div>
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.1em] block mb-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Source Nodes
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {candidate.source_nodes.map((node) => (
                  <span
                    key={node}
                    className="text-[10.5px] font-mono px-2 py-1 rounded-md"
                    style={{
                      background: 'rgba(61,158,125,0.08)',
                      border: '1px solid rgba(61,158,125,0.15)',
                      color: '#3d9e7d',
                    }}
                  >
                    {node}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center gap-4">
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              First seen: {new Date(candidate.first_seen).toLocaleDateString()}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Last seen: {new Date(candidate.last_seen).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}

      {/* Actions footer */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
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
              <span
                className="text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                Reject this pattern?
              </span>
              <button
                type="button"
                onClick={() => {
                  onReject(candidate.id)
                  setConfirmReject(false)
                }}
                disabled={isActing}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                style={{
                  background: 'rgba(214,92,92,0.12)',
                  color: '#d65c5c',
                  opacity: isActing ? 0.5 : 1,
                }}
              >
                Yes, reject
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
            <>
              <button
                type="button"
                onClick={() => setConfirmReject(true)}
                disabled={isActing}
                className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
                style={{
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                  opacity: isActing ? 0.5 : 1,
                }}
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
                style={{
                  background: '#3d9e7d',
                  color: '#fff',
                  opacity: isActing ? 0.5 : 1,
                }}
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

// ── Empty State ──────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="text-center py-20 rounded-xl"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="mb-4">
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="mx-auto"
        >
          <rect
            x="8"
            y="6"
            width="32"
            height="36"
            rx="4"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            fill="none"
            opacity="0.4"
          />
          <path
            d="M18 20l4 4 8-8"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.3"
          />
        </svg>
      </div>
      <p
        className="text-[15px] font-semibold mb-1.5"
        style={{ color: 'var(--text-secondary)' }}
      >
        No pending approvals
      </p>
      <p className="text-[13px] max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
        When the LLM investigator discovers new failure patterns during pipeline
        analysis, they will appear here for your review.
      </p>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────

export default function ApprovalsPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterSeverity>('all')
  const [sortBy, setSortBy] = useState<SortBy>('newest')

  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch('/api/candidates')
      if (res.ok) {
        const data = await res.json()
        setCandidates(data.candidates || [])
      }
    } catch {
      // server not running
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  async function handleApprovePrivate(id: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/candidates/${id}/approve`, { method: 'POST' })
      if (res.ok) {
        await fetchCandidates()
      }
    } catch {
      /* ignore */
    }
    setActing(null)
  }

  async function handleApproveShared(id: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/candidates/${id}/approve-shared`, { method: 'POST' })
      if (res.ok) {
        await fetchCandidates()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to share — are you logged in? Run: argus login')
      }
    } catch {
      /* ignore */
    }
    setActing(null)
  }

  async function handleReject(id: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/candidates/${id}/reject`, { method: 'POST' })
      if (res.ok) {
        await fetchCandidates()
      }
    } catch {
      /* ignore */
    }
    setActing(null)
  }

  // Filter
  const filtered = candidates.filter((c) => {
    if (filter === 'all') return true
    return c.severity === filter
  })

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
      case 'oldest':
        return new Date(a.first_seen).getTime() - new Date(b.first_seen).getTime()
      case 'confidence':
        return b.confidence - a.confidence
      case 'frequency':
        return b.times_seen - a.times_seen
      default:
        return 0
    }
  })

  const criticalCount = candidates.filter((c) => c.severity === 'critical').length
  const warningCount = candidates.filter((c) => c.severity === 'warning').length

  return (
    <div className="max-w-3xl mx-auto px-8 py-10 overflow-auto h-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1
            className="text-[22px] font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Approvals
          </h1>
          {candidates.length > 0 && (
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(124,127,199,0.12)',
                color: '#7c7fc7',
              }}
            >
              {candidates.length} pending
            </span>
          )}
        </div>
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          AI-discovered failure patterns awaiting your review. Approved patterns
          are added to the detection engine for future runs.
        </p>
      </div>

      {/* Toolbar: filter + sort */}
      {candidates.length > 0 && (
        <div
          className="flex items-center justify-between mb-5 pb-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          {/* Severity filter */}
          <div className="flex items-center gap-1.5">
            {(
              [
                { key: 'all', label: 'All', count: candidates.length },
                { key: 'critical', label: 'Critical', count: criticalCount },
                { key: 'warning', label: 'Warning', count: warningCount },
              ] as const
            ).map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5"
                style={{
                  background:
                    filter === key ? 'rgba(124,127,199,0.1)' : 'transparent',
                  color: filter === key ? '#7c7fc7' : 'var(--text-muted)',
                  border:
                    filter === key
                      ? '1px solid rgba(124,127,199,0.2)'
                      : '1px solid transparent',
                }}
              >
                {label}
                {count > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                    style={{
                      background:
                        filter === key
                          ? 'rgba(124,127,199,0.15)'
                          : 'var(--bg-elevated)',
                      color: filter === key ? '#7c7fc7' : 'var(--text-muted)',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Sort by
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="text-[12px] font-medium px-2.5 py-1.5 rounded-lg outline-none cursor-pointer"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="confidence">Confidence</option>
              <option value="frequency">Frequency</option>
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div
          className="text-center py-16 text-[13px]"
          style={{ color: 'var(--text-muted)' }}
        >
          Loading...
        </div>
      ) : sorted.length === 0 && filter !== 'all' ? (
        <div
          className="text-center py-12 rounded-xl"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <p
            className="text-[14px] font-medium mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            No {filter} candidates
          </p>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Try selecting a different filter.
          </p>
        </div>
      ) : candidates.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((c) => (
            <ApprovalCard
              key={c.id}
              candidate={c}
              onApprovePrivate={handleApprovePrivate}
              onApproveShared={handleApproveShared}
              onReject={handleReject}
              acting={acting}
            />
          ))}
        </div>
      )}
    </div>
  )
}
