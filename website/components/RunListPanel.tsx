'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { RunSummary } from '@/lib/types'
import { useSearch } from '@/lib/hooks'

/* ── Helpers ─────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '\u2014'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function truncateNodes(names: string[]): string {
  const filtered = names.filter((n) => !n.startsWith('__'))
  if (filtered.length <= 4) return filtered.join(' \u2192 ')
  return filtered.slice(0, 3).join(' \u2192 ') + ` +${filtered.length - 3}`
}

function groupByDate(runs: RunSummary[]): { label: string; runs: RunSummary[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: Record<string, RunSummary[]> = { Today: [], Yesterday: [], 'This Week': [], Older: [] }
  for (const run of runs) {
    const d = new Date(run.started_at)
    if (d >= today) groups.Today.push(run)
    else if (d >= yesterday) groups.Yesterday.push(run)
    else if (d >= weekAgo) groups['This Week'].push(run)
    else groups.Older.push(run)
  }
  return Object.entries(groups)
    .filter(([, r]) => r.length > 0)
    .map(([label, runs]) => ({ label, runs }))
}

/* ── Status colors ─────────────────────────────────────────── */

const STATUS_DOT_COLOR: Record<string, string> = {
  clean: '#10b981',
  silent_failure: '#f59e0b',
  crashed: '#ef4444',
  semantic_fail: '#a855f7',
  interrupted: '#f59e0b',
}

const STATUS_LABEL: Record<string, string> = {
  clean: 'clean',
  silent_failure: 'silent failure',
  crashed: 'crashed',
  semantic_fail: 'semantic fail',
  interrupted: 'interrupted',
}

const STATUS_PILL_BG: Record<string, string> = {
  clean: 'rgba(16,185,129,0.1)',
  silent_failure: 'rgba(245,158,11,0.12)',
  crashed: 'rgba(239,68,68,0.08)',
  semantic_fail: 'rgba(168,85,247,0.08)',
  interrupted: 'rgba(245,158,11,0.08)',
}

/* ── Stat card ─────────────────────────────────────────────── */

function StatCard({ icon, label, value, valueColor }: { icon: React.ReactNode; label: string; value: string | number; valueColor?: string }) {
  return (
    <div className="card rounded-xl px-3 py-2.5 flex items-center gap-2.5">
      {icon}
      <div>
        <div className="text-[18px] font-bold tabular-nums tracking-[-0.03em] leading-none" style={{ color: valueColor ?? 'var(--text-primary)' }}>{value}</div>
        <div className="text-[10.5px] font-medium leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  )
}

/* ── Warm, soft stat icons (matching expected design) ──────── */

function IconTotalRuns() {
  return (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.08)' }}>
      <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
        <rect x="2.5" y="3" width="12" height="11" rx="2.5" stroke="#6366f1" strokeWidth="1.1"/>
        <path d="M5.5 6.5h6M5.5 9h4M5.5 11.5h2.5" stroke="#6366f1" strokeWidth="1.1" strokeLinecap="round"/>
      </svg>
    </div>
  )
}

function IconClean() {
  return (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.08)' }}>
      <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
        <path d="M3.5 9.5l3 3.5c.5.5 1 .3 1.3-.1L13.5 5" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function IconFailed() {
  return (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.07)' }}>
      <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
        <path d="M8.5 3L14.5 13.5H2.5L8.5 3Z" stroke="#ef4444" strokeWidth="1.1" strokeLinejoin="round"/>
        <path d="M8.5 7.5v2" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round"/>
        <circle cx="8.5" cy="11.5" r="0.6" fill="#ef4444"/>
      </svg>
    </div>
  )
}

function IconPassRate() {
  return (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.08)' }}>
      <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
        <path d="M3 12c1.5-1 3-4.5 4.5-4s2.5 2 4 1S14 5 14.5 4" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

/* ── Inline rename input ────────────────────────────────────── */

function InlineRename({ run, onDone }: { run: RunSummary; onDone: (alias: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(run.alias ?? '')

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  const submit = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed) {
      fetch(`/api/runs/${run.run_id}/alias`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: trimmed }),
      })
      onDone(trimmed)
    } else {
      fetch(`/api/runs/${run.run_id}/alias`, { method: 'DELETE' })
      onDone(null)
    }
  }, [value, run.run_id, onDone])

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onDone(run.alias ?? null) }}
      className="text-[13px] font-semibold bg-transparent outline-none border-b"
      style={{ color: 'var(--text-primary)', borderColor: '#6366f1', width: '140px' }}
      placeholder="Name this run..."
    />
  )
}

/* ── Component ───────────────────────────────────────────────── */

export default function RunListPanel({
  runs,
  selectedRunId,
  onSelectRun,
  loading,
}: {
  runs: RunSummary[]
  selectedRunId: string | null
  onSelectRun: (id: string) => void
  loading: boolean
}) {
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [localAliases, setLocalAliases] = useState<Record<string, string | null>>({})
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const visibleRuns = runs.filter((r) => !deletedIds.has(r.run_id))
  const filtered = useSearch(visibleRuns, query)

  // Separate parent runs from replay runs
  const parentRuns = filtered.filter((r) => !r.parent_run_id)
  const childMap = new Map<string, RunSummary[]>()
  for (const r of filtered) {
    if (r.parent_run_id) {
      const children = childMap.get(r.parent_run_id) ?? []
      children.push(r)
      childMap.set(r.parent_run_id, children)
    }
  }

  const groups = groupByDate(parentRuns)

  // Stats count only parent runs
  const counts = {
    total: parentRuns.length,
    clean: parentRuns.filter((r) => r.overall_status === 'clean').length,
    failed: parentRuns.filter((r) => r.overall_status !== 'clean').length,
  }
  const passRate = counts.total > 0 ? Math.round((counts.clean / counts.total) * 100) : null

  function getAlias(run: RunSummary): string | null | undefined {
    if (run.run_id in localAliases) return localAliases[run.run_id]
    return run.alias
  }

  function handleRenameDone(runId: string, alias: string | null) {
    setLocalAliases((prev) => ({ ...prev, [runId]: alias }))
    setEditingId(null)
  }

  function handleDelete(runId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this run? This cannot be undone.')) return
    fetch(`/api/runs/${runId}`, { method: 'DELETE' })
    setDeletedIds((prev) => new Set(prev).add(runId))
    // Also delete any child replays
    for (const child of (childMap.get(runId) ?? [])) {
      fetch(`/api/runs/${child.run_id}`, { method: 'DELETE' })
      setDeletedIds((prev) => new Set(prev).add(child.run_id))
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)' }}>
      {/* Fixed header area */}
      <div className="shrink-0">
        {/* Page header */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-4">
          <div className="min-w-0 shrink-0">
            <h1 className="text-[20px] font-bold tracking-[-0.025em] leading-tight" style={{ color: 'var(--text-primary)' }}>Runs</h1>
            <p className="text-[12px] font-normal mt-0.5" style={{ color: 'var(--text-muted)' }}>Pipeline execution history</p>
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
            <div
              className="min-w-0 max-w-[320px] flex-1 flex items-center gap-2.5 px-3 py-2 rounded-[10px] transition-colors"
              style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', boxShadow: '0 1px 2px rgba(16,24,40,0.035)' }}
            >
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none" className="shrink-0">
                <circle cx="6" cy="6" r="4.5" stroke="#98a2b3" strokeWidth="1.35"/>
                <path d="M9.5 9.5L12.5 12.5" stroke="#98a2b3" strokeWidth="1.35" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                placeholder="Search runs, graphs, nodes..."
                className="min-w-0 flex-1 text-[12.5px] font-medium bg-transparent outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
              <kbd
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
              >
                {'\u2318'}K
              </kbd>
            </div>

            <button
              className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 transition-colors"
              style={{ background: '#ffffff', color: '#6366f1', border: '1px solid var(--border-subtle)', boxShadow: '0 1px 2px rgba(16,24,40,0.035)' }}
            >
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
                <rect x="1.5" y="1.5" width="11" height="11" rx="2.2" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="4" y="4" width="6" height="6" rx="1.2" fill="rgba(99,102,241,0.12)" stroke="currentColor" strokeWidth="1.1"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Stat cards */}
        {counts.total > 0 && (
          <div className="grid grid-cols-4 gap-1.5 px-4 pb-3">
            <StatCard icon={<IconTotalRuns />} label="Total Runs" value={counts.total} />
            <StatCard icon={<IconClean />} label="Clean" value={counts.clean} valueColor="#10b981" />
            <StatCard
              icon={<IconFailed />}
              label="Failed"
              value={counts.failed}
              valueColor={counts.failed > 0 ? '#ef4444' : undefined}
            />
            <StatCard
              icon={<IconPassRate />}
              label="Pass Rate"
              value={passRate !== null ? `${passRate}%` : '\u2014'}
              valueColor={passRate === null ? undefined : passRate === 100 ? '#10b981' : passRate >= 70 ? '#f59e0b' : '#ef4444'}
            />
          </div>
        )}

        {/* Search + filters — SINGLE ROW */}
        <div className="px-5 pb-3.5 flex items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ color: '#b0b6c0' }}>
              <circle cx="6.5" cy="6.5" r="4.8" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M10.2 10.2L13.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search runs..."
              className="w-full text-[13px] font-normal pl-9 pr-3 py-[9px] rounded-[10px] outline-none transition-colors"
              style={{
                background: '#ffffff',
                border: '1px solid #e8eaed',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans), Inter, sans-serif',
                letterSpacing: '0.01em',
              }}
            />
          </div>
          <button
            className="text-[13px] font-bold px-3.5 py-[9px] rounded-[10px] transition-colors flex items-center gap-1.5 shrink-0"
            style={{ background: '#ffffff', color: '#6b7280', border: '1px solid #e8eaed', fontFamily: 'var(--font-sans), Inter, sans-serif' }}
          >
            Status
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ marginLeft: '1px' }}><path d="M2.2 3.5l2.3 2.3 2.3-2.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button
            className="text-[13px] font-bold px-3.5 py-[9px] rounded-[10px] transition-colors flex items-center gap-2 shrink-0"
            style={{ background: '#ffffff', color: '#6b7280', border: '1px solid #e8eaed', fontFamily: 'var(--font-sans), Inter, sans-serif' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: '#8b919e' }}>
              <circle cx="3.8" cy="7" r="2" stroke="currentColor" strokeWidth="1"/>
              <circle cx="10.2" cy="3.8" r="2" stroke="currentColor" strokeWidth="1"/>
              <circle cx="10.2" cy="10.2" r="2" stroke="currentColor" strokeWidth="1"/>
              <path d="M5.7 6.2L8.3 4.5M5.7 7.8L8.3 9.5" stroke="currentColor" strokeWidth="0.9"/>
            </svg>
            Graph
          </button>
          <button
            className="text-[13px] font-bold px-3.5 py-[9px] rounded-[10px] transition-colors flex items-center gap-2 shrink-0"
            style={{ background: '#ffffff', color: '#6b7280', border: '1px solid #e8eaed', fontFamily: 'var(--font-sans), Inter, sans-serif' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: '#8b919e' }}>
              <rect x="1.5" y="2.8" width="11" height="9" rx="1.8" stroke="currentColor" strokeWidth="1"/>
              <path d="M1.5 6h11" stroke="currentColor" strokeWidth="1"/>
              <path d="M4.8 1.2v2.2M9.2 1.2v2.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            Time
          </button>
          <button
            className="p-[9px] rounded-[10px] transition-colors shrink-0"
            style={{ background: '#ffffff', color: '#9ca3af', border: '1px solid #e8eaed' }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M2.5 3.5h10M4.5 7.5h6M6.5 11.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable run list */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
        {loading && (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center">
            <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No runs found</div>
            <div className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {query ? 'Try a different search term.' : 'Run a pipeline with ARGUS to see results.'}
            </div>
          </div>
        )}

        {!loading && groups.map((group) => (
          <div key={group.label}>
            <div className="px-1 pt-4 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
                {group.label}
              </span>
            </div>
            <div className="space-y-1.5">
              {group.runs.map((run) => {
                const isSelected = selectedRunId === run.run_id
                const dotColor = STATUS_DOT_COLOR[run.overall_status] ?? '#9ca3af'
                const statusLabel = STATUS_LABEL[run.overall_status] ?? run.overall_status
                const pillBg = STATUS_PILL_BG[run.overall_status] ?? 'rgba(156,163,175,0.08)'
                const alias = getAlias(run)
                const children = childMap.get(run.run_id) ?? []

                return (
                  <div key={run.run_id}>
                    {/* Parent run card */}
                    <button
                      onClick={() => onSelectRun(run.run_id)}
                      className="group w-full text-left rounded-[14px] px-4 py-3.5 transition-all"
                      style={{
                        background: isSelected
                          ? 'linear-gradient(90deg, rgba(99,102,241,0.115), rgba(99,102,241,0.055))'
                          : 'var(--bg-surface)',
                        border: isSelected ? '1px solid rgba(99,102,241,0.46)' : '1px solid var(--border-subtle)',
                        boxShadow: isSelected
                          ? 'inset 0 0 0 1px rgba(99,102,241,0.18), inset 4px 0 0 rgba(99,102,241,0.86), 0 8px 22px rgba(99,102,241,0.10)'
                          : '0 1px 2px rgba(16,24,40,0.035)',
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: dotColor }} />
                          {editingId === run.run_id ? (
                            <InlineRename run={run} onDone={(a) => handleRenameDone(run.run_id, a)} />
                          ) : (
                            <>
                              <span className="text-[13.5px] font-bold tracking-[-0.02em] truncate" style={{ color: 'var(--text-primary)' }}>
                                {alias || run.run_id.slice(0, 15)}
                              </span>
                              {alias && (
                                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                  {run.run_id.slice(0, 8)}
                                </span>
                              )}
                              {/* Pencil icon — visible on hover */}
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingId(run.run_id) }}
                                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                                title="Rename run"
                              >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                  <path d="M7.5 2.5l2 2M2 8l-.5 2.5L4 10l6-6-2-2-6 6z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              {/* Delete icon — visible on hover */}
                              <button
                                onClick={(e) => handleDelete(run.run_id, e)}
                                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                                style={{ color: '#ef4444' }}
                                title="Delete run"
                              >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 3h8M4.5 3V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M3 3l.5 7a1 1 0 001 1h3a1 1 0 001-1L9 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </>
                          )}
                          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md shrink-0" style={{ color: dotColor, background: pillBg }}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="grid grid-cols-[54px_42px] items-center gap-3 shrink-0">
                          <span className="text-[10.5px] font-medium tabular-nums text-right" style={{ color: 'var(--text-muted)' }}>
                            {run.step_count} step{run.step_count !== 1 ? 's' : ''}
                          </span>
                          <svg width="6" height="10" viewBox="0 0 6 10" fill="none" className="opacity-30 justify-self-end">
                            <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-normal truncate max-w-[65%]" style={{ color: 'var(--text-muted)' }}>
                          {truncateNodes(run.graph_node_names)}
                        </span>
                        <div className="grid grid-cols-[54px_42px] items-center gap-3 shrink-0">
                          <span className="text-[10.5px] font-medium text-right" style={{ color: 'var(--text-muted)' }}>
                            {relativeTime(run.started_at)}
                          </span>
                          <span className="text-[10.5px] font-medium tabular-nums text-right" style={{ color: 'var(--text-muted)' }}>
                            {formatDuration(run.duration_ms)}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Replay sub-rows */}
                    {children.map((child) => {
                      const cSelected = selectedRunId === child.run_id
                      const cDot = STATUS_DOT_COLOR[child.overall_status] ?? '#9ca3af'
                      const cLabel = STATUS_LABEL[child.overall_status] ?? child.overall_status
                      const cPill = STATUS_PILL_BG[child.overall_status] ?? 'rgba(156,163,175,0.08)'
                      const cAlias = getAlias(child)
                      return (
                        <button
                          key={child.run_id}
                          onClick={() => onSelectRun(child.run_id)}
                          className="group w-full text-left flex items-center gap-2 ml-4 mt-0.5 rounded-[10px] px-3 py-2 transition-all"
                          style={{
                            background: cSelected
                              ? 'linear-gradient(90deg, rgba(99,102,241,0.10), rgba(99,102,241,0.04))'
                              : 'var(--bg-surface)',
                            border: cSelected ? '1px solid rgba(99,102,241,0.35)' : '1px solid var(--border-subtle)',
                            borderLeft: `3px solid ${cDot}`,
                          }}
                        >
                          {/* Replay icon */}
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0" style={{ color: 'var(--text-muted)' }}>
                            <path d="M2 2v3.5h3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M2 5.5A4.5 4.5 0 1 1 3.3 9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                          </svg>
                          <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: cDot }} />
                          {editingId === child.run_id ? (
                            <InlineRename run={child} onDone={(a) => handleRenameDone(child.run_id, a)} />
                          ) : (
                            <>
                              <span className="text-[11.5px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                {cAlias || child.run_id.slice(0, 12)}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingId(child.run_id) }}
                                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                                title="Rename rerun"
                              >
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <path d="M7.5 2.5l2 2M2 8l-.5 2.5L4 10l6-6-2-2-6 6z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(child.run_id, e) }}
                                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                                style={{ color: '#ef4444' }}
                                title="Delete rerun"
                              >
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 3h8M4.5 3V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M3 3l.5 7a1 1 0 001 1h3a1 1 0 001-1L9 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </>
                          )}
                          {child.replay_from_step && (
                            <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>
                              from {child.replay_from_step}
                            </span>
                          )}
                          <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ color: cDot, background: cPill }}>
                            {cLabel}
                          </span>
                          <span className="ml-auto text-[10px] font-medium tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                            {formatDuration(child.duration_ms)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
