'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────

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

type Tab = 'private' | 'shared'

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

// ── Signature Row ────────────────────────────────────────────

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
      {/* Top row: badges + meta */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="font-mono text-[11px] font-bold shrink-0"
          style={{ color: '#7c7fc7', minWidth: 48 }}
        >
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

      {/* Pattern */}
      <div
        className="rounded-lg px-3.5 py-2.5 font-mono text-[12.5px] break-all"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
        }}
      >
        {sig.pattern}
      </div>

      {/* Description + actions */}
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

// ── Main Page ────────────────────────────────────────────────

export default function PatternsPage() {
  const [tab, setTab] = useState<Tab>('private')
  const [privateSigs, setPrivateSigs] = useState<Signature[]>([])
  const [sharedSigs, setSharedSigs] = useState<Signature[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [privRes, sharedRes] = await Promise.all([
        fetch('/api/custom-signatures'),
        fetch('/api/shared-signatures'),
      ])
      if (privRes.ok) {
        const data = await privRes.json()
        setPrivateSigs(
          (data || []).map((s: Signature) => ({ ...s, source: s.source || 'learned' })),
        )
      }
      if (sharedRes.ok) {
        const data = await sharedRes.json()
        setSharedSigs(
          (data || []).map((s: Signature) => ({ ...s, source: 'shared' })),
        )
      }
    } catch {
      // server not running
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleRemovePrivate(id: string) {
    setActing(true)
    try {
      const res = await fetch(`/api/custom-signatures/${id}`, { method: 'DELETE' })
      if (res.ok) await fetchData()
    } catch { /* ignore */ }
    setActing(false)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/shared-signatures/sync')
      if (res.ok) await fetchData()
    } catch { /* ignore */ }
    setSyncing(false)
  }

  const current = tab === 'private' ? privateSigs : sharedSigs

  return (
    <div className="max-w-3xl mx-auto px-8 py-10 overflow-auto h-full">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-[22px] font-bold tracking-tight mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          Pattern Library
        </h1>
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          Active detection patterns loaded by the heuristic engine. Manage your
          private patterns or browse community-shared ones.
        </p>
      </div>

      {/* Tabs + Sync */}
      <div className="flex items-center justify-between mb-5">
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--border-subtle)', width: 'fit-content' }}
        >
          {([
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
      ) : current.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <p className="text-[14px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            {tab === 'private' ? 'No private patterns yet' : 'No shared patterns yet'}
          </p>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {tab === 'private'
              ? 'Approve candidates as "Private" from the Approvals page to add patterns here.'
              : 'Approve candidates as "Shared" to contribute patterns for all users, or click Sync to pull community patterns.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {current.map((s) => (
            <SignatureRow
              key={s.id}
              sig={s}
              onRemove={tab === 'private' ? handleRemovePrivate : null}
              acting={acting}
            />
          ))}
        </div>
      )}
    </div>
  )
}
