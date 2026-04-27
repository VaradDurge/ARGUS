'use client'

import Link from 'next/link'
import type { RunSummary } from '@/lib/types'
import { RunStatusBadge } from './StatusBadge'

function getRunShape(run: RunSummary): { label: string; color: string } | null {
  if (run.overall_status === 'clean' && !run.first_failure_step) {
    return { label: 'clean', color: '#22c55e' }
  }
  if (!run.first_failure_step) return null
  const firstNode = run.graph_node_names.find((n) => !n.startsWith('__'))
  if (run.first_failure_step === firstNode) {
    return { label: 'early fail', color: '#ef4444' }
  }
  return { label: 'partial', color: '#f59e0b' }
}

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
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function truncateNodes(names: string[]): string {
  const filtered = names.filter((n) => !n.startsWith('__'))
  if (filtered.length <= 4) return filtered.join(' → ')
  return filtered.slice(0, 3).join(' → ') + ` +${filtered.length - 3}`
}

interface RunTableProps {
  runs: RunSummary[]
}

const COL_HEADER_STYLE: React.CSSProperties = {
  fontSize: '9px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-secondary)',
  fontWeight: 600,
  paddingBottom: '12px',
  paddingTop: '4px',
}

export default function RunTable({ runs }: RunTableProps) {
  if (runs.length === 0) {
    return (
      <div className="text-center py-24" style={{ color: '#3f3f46' }}>
        <div
          className="mx-auto mb-5 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 1.5L16.5 5.5V12.5L9 16.5L1.5 12.5V5.5L9 1.5Z" stroke="#27272a" strokeWidth="1.2" fill="none"/>
            <circle cx="9" cy="9" r="2" stroke="#27272a" strokeWidth="1"/>
          </svg>
        </div>
        <div className="text-xs" style={{ color: '#52525b' }}>No runs found</div>
        <div className="text-[11px] mt-1.5" style={{ color: '#3f3f46' }}>
          Run a LangGraph pipeline with ARGUS watching to see results here.
        </div>
      </div>
    )
  }

  return (
    <div
      className="overflow-x-auto rounded-lg"
      style={{
        border: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
        boxShadow: '0 10px 26px rgba(0,0,0,0.25)',
      }}
    >
      <table className="w-full border-collapse" style={{ fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}>
            <th style={{ ...COL_HEADER_STYLE, textAlign: 'left', paddingLeft: '16px', paddingRight: '24px' }}>Run ID</th>
            <th style={{ ...COL_HEADER_STYLE, textAlign: 'left', paddingRight: '24px' }}>Status</th>
            <th style={{ ...COL_HEADER_STYLE, textAlign: 'left', paddingRight: '24px' }} className="hidden lg:table-cell">Graph</th>
            <th style={{ ...COL_HEADER_STYLE, textAlign: 'right', paddingRight: '24px' }}>Steps</th>
            <th style={{ ...COL_HEADER_STYLE, textAlign: 'left', paddingRight: '24px' }}>Started</th>
            <th style={{ ...COL_HEADER_STYLE, textAlign: 'right', paddingRight: '24px' }}>Duration</th>
            <th style={{ ...COL_HEADER_STYLE, textAlign: 'left', paddingRight: '24px' }}>First Failure</th>
            <th style={{ ...COL_HEADER_STYLE, textAlign: 'right' }}>Shape</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const isFailed = run.overall_status !== 'clean'
            const shape = getRunShape(run)
            return (
              <tr
                key={run.run_id}
                className="group transition-colors"
                style={{
                  borderBottom: `1px solid ${isFailed ? 'rgba(239,68,68,0.24)' : 'var(--border-subtle)'}`,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLTableRowElement
                  el.style.background = isFailed ? 'rgba(239,68,68,0.09)' : 'rgba(255,255,255,0.03)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLTableRowElement
                  el.style.background = 'transparent'
                }}
              >
                {/* Run ID */}
                <td className="py-3.5 pr-6 pl-4">
                  <Link href={`/runs/${run.run_id}`} className="block">
                    <span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                      {run.run_id.slice(0, 14)}
                      {run.run_id.length > 14 && (
                        <span style={{ color: '#3f3f46' }}>…</span>
                      )}
                    </span>
                    {run.parent_run_id && (
                      <div className="text-[10px] mt-0.5" style={{ color: '#3f3f46' }}>↩ compare</div>
                    )}
                  </Link>
                </td>

                {/* Status */}
                <td className="py-3.5 pr-6">
                  <Link href={`/runs/${run.run_id}`} className="block">
                    <RunStatusBadge status={run.overall_status} />
                  </Link>
                </td>

                {/* Graph */}
                <td className="py-3.5 pr-6 hidden lg:table-cell max-w-xs">
                  <Link href={`/runs/${run.run_id}`} className="block">
                    <span
                      className="text-xs truncate block font-mono"
                      style={{ color: '#3f3f46', maxWidth: '200px' }}
                    >
                      {truncateNodes(run.graph_node_names)}
                    </span>
                  </Link>
                </td>

                {/* Steps */}
                <td className="py-3.5 pr-6 text-right">
                  <Link href={`/runs/${run.run_id}`} className="block">
                    <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {run.step_count}
                    </span>
                  </Link>
                </td>

                {/* Started */}
                <td className="py-3.5 pr-6">
                  <Link href={`/runs/${run.run_id}`} className="block">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }} title={run.started_at}>
                      {relativeTime(run.started_at)}
                    </span>
                  </Link>
                </td>

                {/* Duration */}
                <td className="py-3.5 pr-6 text-right">
                  <Link href={`/runs/${run.run_id}`} className="block">
                    <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {formatDuration(run.duration_ms)}
                    </span>
                  </Link>
                </td>

                {/* First failure */}
                <td className="py-3.5 pr-6">
                  <Link href={`/runs/${run.run_id}`} className="block">
                    {run.first_failure_step ? (
                      <span
                        className="text-xs font-mono"
                        style={{ color: '#ef4444' }}
                      >
                        {run.first_failure_step}
                      </span>
                    ) : (
                      <span style={{ color: '#27272a' }}>—</span>
                    )}
                  </Link>
                </td>

                {/* Shape */}
                <td className="py-3.5 text-right">
                  <Link href={`/runs/${run.run_id}`} className="block">
                    {shape ? (
                      <span
                        className="text-xs font-mono"
                        style={{ color: shape.color }}
                      >
                        {shape.label}
                      </span>
                    ) : (
                      <span style={{ color: '#27272a' }}>—</span>
                    )}
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
