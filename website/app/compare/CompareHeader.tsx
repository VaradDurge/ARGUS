'use client'

import type { RunSummary, RunRecord } from '@/lib/types'
import { formatDur } from '@/lib/run-utils'
import { STATUS_DOT_COLOR } from './lib/compare-utils'

const STATUS_DISPLAY: Record<string, string> = {
  clean: 'clean',
  silent_failure: 'silent failure',
  crashed: 'crashed',
  semantic_fail: 'semantic fail',
  interrupted: 'interrupted',
}

function statusColor(s: string) {
  return STATUS_DOT_COLOR[s] ?? '#9ca3af'
}

function formatTs(iso: string): string {
  const d = new Date(iso)
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
  return `${month} ${d.getDate()}, ${d.getFullYear()} \u2022 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

function selectorLabel(run: RunRecord | null, fallback: string): string {
  if (!run) return fallback
  const status = run.overall_status
  const isReplay = !!run.parent_run_id
  if (isReplay) {
    const fixedCrash = status === 'clean' || status === 'silent_failure'
    return `Replay${run.run_id.includes('-R') ? ` ${run.run_id.split('-R').pop()}` : ''} (${fixedCrash ? 'Fixed' : 'Failed'})`
  }
  const label = status === 'clean' ? 'Passed' : status === 'crashed' ? 'Failed' : status === 'silent_failure' ? 'Failed' : 'Unknown'
  return `Base Run (${label})`
}

function badgeLabel(run: RunRecord): string {
  const isReplay = !!run.parent_run_id
  if (isReplay) {
    const base = STATUS_DISPLAY[run.overall_status] ?? run.overall_status
    return `replay (fixed ${base === 'clean' ? 'all' : base})`
  }
  return STATUS_DISPLAY[run.overall_status] ?? run.overall_status
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
  return (
    <div className="space-y-3">
      {/* Selectors row */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <select
          value={selectedA}
          onChange={(e) => onSelectA(e.target.value)}
          className="text-[13px] px-3.5 py-2 rounded-lg outline-none"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            minWidth: '200px',
          }}
        >
          <option value="">{selectorLabel(runA, 'Select base run...')}</option>
          {runs.map((r) => (
            <option key={r.run_id} value={r.run_id}>
              {r.run_id} \u2022 {r.overall_status}
            </option>
          ))}
        </select>

        {/* Swap / Copy */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { onSelectA(selectedB); onSelectB(selectedA) }}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity"
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
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity"
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
          className="text-[13px] px-3.5 py-2 rounded-lg outline-none"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            minWidth: '200px',
          }}
        >
          <option value="">{selectorLabel(runB, 'Select replay...')}</option>
          {runs.map((r) => (
            <option key={r.run_id} value={r.run_id}>
              {r.run_id} \u2022 {r.overall_status}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M4.5 2.5v-1a1 1 0 011-1h2a1 1 0 011 1v1M2 4.5h9M8.5 6v4M4.5 6v4M3 4.5l.5 6a1.5 1.5 0 001.5 1.5h3a1.5 1.5 0 001.5-1.5l.5-6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Share
          </button>
          <button
            type="button"
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 8.5V1.5M3.5 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1.5 9v2a1 1 0 001 1h8a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Export
          </button>
          <button
            type="button"
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            style={{ color: '#10b981', border: '1px solid #10b981' }}
          >
            + Replay from diff
          </button>
        </div>
      </div>

      {/* Run info cards */}
      {runA && runB && (
        <div className="flex items-center gap-3">
          {/* Run A card */}
          <div
            className="flex-1 px-4 py-3 rounded-xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: statusColor(runA.overall_status) }} />
              <span className="text-[14px] font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                {runA.run_id}
              </span>
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full ml-1"
                style={{ color: statusColor(runA.overall_status), background: `${statusColor(runA.overall_status)}10` }}
              >
                {badgeLabel(runA)}
              </span>
            </div>
            <div className="text-[12px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {runA.started_at ? formatTs(runA.started_at) : ''} \u2022 {(runA.steps ?? []).length} steps \u2022 {formatDur(runA.duration_ms)} \u2022 v{runA.argus_version}
            </div>
          </div>

          {/* VS */}
          <span className="text-[13px] font-bold shrink-0" style={{ color: 'var(--text-muted)' }}>vs</span>

          {/* Run B card */}
          <div
            className="flex-1 px-4 py-3 rounded-xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: statusColor(runB.overall_status) }} />
              <span className="text-[14px] font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                {runB.run_id}
              </span>
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full ml-1"
                style={{ color: statusColor(runB.overall_status), background: `${statusColor(runB.overall_status)}10` }}
              >
                {badgeLabel(runB)}
              </span>
            </div>
            <div className="text-[12px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {runB.started_at ? formatTs(runB.started_at) : ''} \u2022 {(runB.steps ?? []).length} steps \u2022 {formatDur(runB.duration_ms)} \u2022 v{runB.argus_version}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
