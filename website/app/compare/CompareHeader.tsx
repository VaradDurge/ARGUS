'use client'

import type { RunSummary, RunRecord } from '@/lib/types'
import { formatDur } from '@/lib/run-utils'
import { STATUS_DOT_COLOR, STATUS_LABEL } from './lib/compare-utils'

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_DOT_COLOR[status] ?? '#9ca3af'
  const label = STATUS_LABEL[status] ?? status
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color, background: `${color}12`, border: `1px solid ${color}20` }}
    >
      {label}
    </span>
  )
}

function formatTs(iso: string): string {
  const d = new Date(iso)
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
  const day = d.getDate()
  const year = d.getFullYear()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${month} ${day}, ${year} \u2022 ${h}:${m}:${s}`
}

export default function CompareHeader({
  runs,
  selectedA,
  selectedB,
  runA,
  runB,
  onSelectA,
  onSelectB,
}: {
  runs: RunSummary[]
  selectedA: string
  selectedB: string
  runA: RunRecord | null
  runB: RunRecord | null
  onSelectA: (id: string) => void
  onSelectB: (id: string) => void
}) {
  const stepsA = runA?.steps?.length ?? 0
  const stepsB = runB?.steps?.length ?? 0

  return (
    <div className="space-y-4">
      {/* Selectors + Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedA}
          onChange={(e) => onSelectA(e.target.value)}
          className="min-w-[280px] text-[13px] font-mono px-3 py-2 rounded-lg outline-none transition-colors"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="">Select base run...</option>
          {runs.map((r) => (
            <option key={r.run_id} value={r.run_id}>
              {r.run_id.slice(0, 16)} \u2022 {r.overall_status}
            </option>
          ))}
        </select>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { onSelectA(selectedB); onSelectB(selectedA) }}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
            title="Swap runs"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M4 3l-2.5 2.5L4 8M10 6l2.5 2.5L10 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1.5 5.5h11M12.5 8.5h-11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            type="button"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
            title="Copy comparison URL"
            onClick={() => navigator.clipboard?.writeText(window.location.href)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M10 4V3a1.5 1.5 0 00-1.5-1.5H3A1.5 1.5 0 001.5 3v5.5A1.5 1.5 0 003 10h1" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
        </div>

        <select
          value={selectedB}
          onChange={(e) => onSelectB(e.target.value)}
          className="min-w-[280px] text-[13px] font-mono px-3 py-2 rounded-lg outline-none transition-colors"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="">Select comparison run...</option>
          {runs.map((r) => (
            <option key={r.run_id} value={r.run_id}>
              {r.run_id.slice(0, 16)} \u2022 {r.overall_status}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            Share
          </button>
          <button
            type="button"
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 8v2.5M2 8l4 2.5L10 8M6 1.5V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Export
          </button>
          <button
            type="button"
            className="text-[12px] font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            style={{ color: '#ffffff', background: '#10b981' }}
          >
            + Replay from diff
          </button>
        </div>
      </div>

      {/* Run info row */}
      {runA && runB && (
        <div
          className="flex items-center gap-4 px-5 py-3 rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          {/* Run A info */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_DOT_COLOR[runA.overall_status] ?? '#9ca3af' }} />
            <span className="text-[13px] font-bold font-mono truncate" style={{ color: 'var(--text-primary)' }}>
              {runA.run_id.slice(0, 16)}
            </span>
            <StatusBadge status={runA.overall_status} />
          </div>

          <div className="text-[12px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
            {runA.started_at ? formatTs(runA.started_at) : ''} \u2022 {stepsA} steps \u2022 {formatDur(runA.duration_ms)} \u2022 v{runA.argus_version}
          </div>

          {/* VS divider */}
          <div className="shrink-0 text-[12px] font-bold px-3" style={{ color: 'var(--text-faint)' }}>vs</div>

          {/* Run B info */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_DOT_COLOR[runB.overall_status] ?? '#9ca3af' }} />
            <span className="text-[13px] font-bold font-mono truncate" style={{ color: 'var(--text-primary)' }}>
              {runB.run_id.slice(0, 16)}
            </span>
            <StatusBadge status={runB.overall_status} />
          </div>

          <div className="text-[12px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
            {runB.started_at ? formatTs(runB.started_at) : ''} \u2022 {stepsB} steps \u2022 {formatDur(runB.duration_ms)} \u2022 v{runB.argus_version}
          </div>
        </div>
      )}
    </div>
  )
}
