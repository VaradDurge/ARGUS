'use client'

import { formatDur } from '@/lib/run-utils'
import type { NodeDiff } from '../lib/compare-utils'
import { STEP_ICON } from '../lib/compare-utils'

function formatDelta(bMs: number | undefined, aMs: number | undefined): string {
  if (bMs === undefined || aMs === undefined) return '-'
  const delta = aMs - bMs
  const pct = bMs > 0 ? ((delta / bMs) * 100).toFixed(1) : '0'
  const sign = delta >= 0 ? '+' : ''
  if (Math.abs(delta) < 50) return '-'
  if (delta >= 1000 || delta <= -1000) return `${sign}${(delta / 1000).toFixed(2)}s (${sign}${pct}%)`
  return `${sign}${Math.round(delta)}ms (${sign}${pct}%)`
}

function impactLabel(diff: NodeDiff): { text: string; color: string } {
  if (diff.isFixed) return { text: 'Improved', color: '#10b981' }
  if (diff.isRegression) return { text: 'Degraded', color: '#ef4444' }
  if (diff.inspectionDiffs.length > 0 || diff.fieldDiffs.length > 0) {
    const hasImprovement = diff.inspectionDiffs.some((d) => d.iconColor === '#10b981')
    if (hasImprovement) return { text: 'Improved', color: '#10b981' }
    return { text: 'Changed', color: '#f59e0b' }
  }
  return { text: 'No change', color: '#9ca3af' }
}

export default function NodeComparisonTable({ diffs }: { diffs: NodeDiff[] }) {
  return (
    <div className="card rounded-xl overflow-hidden">
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <h3 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>Node Comparison</h3>
      </div>

      <table className="w-full text-[12px]">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--text-muted)', width: '30%' }}>Node</th>
            <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)', width: '15%' }}>Base Run</th>
            <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)', width: '15%' }}>Replay 1</th>
            <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)', width: '22%' }}>Change</th>
            <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)', width: '18%' }}>Impact</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((diff, i) => {
            const beforeIcon = diff.before ? STEP_ICON[diff.before.status] : null
            const afterIcon = diff.after ? STEP_ICON[diff.after.status] : null
            const impact = impactLabel(diff)

            return (
              <tr
                key={diff.name}
                style={{ borderBottom: i < diffs.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                className="transition-colors hover:bg-black/[0.02]"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                    <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{diff.name}</span>
                    {beforeIcon && (
                      <span className="text-[11px]" style={{ color: beforeIcon.color }}>{beforeIcon.icon}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {diff.before ? formatDur(diff.before.duration_ms) : '\u2014'}
                    </span>
                    {diff.before && (
                      <span className="text-[10px] font-semibold" style={{ color: (STEP_ICON[diff.before.status] ?? {}).color ?? '#9ca3af' }}>
                        {diff.before.status === 'pass' ? 'Passed' : diff.before.status === 'fail' ? 'Failed' : diff.before.status}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {diff.after ? formatDur(diff.after.duration_ms) : '\u2014'}
                    </span>
                    {diff.after && (
                      <span className="text-[10px] font-semibold" style={{ color: (STEP_ICON[diff.after.status] ?? {}).color ?? '#9ca3af' }}>
                        {diff.after.status === 'pass' ? 'Passed' : diff.after.status === 'fail' ? 'Failed' : diff.after.status}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {formatDelta(diff.before?.duration_ms, diff.after?.duration_ms)}
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-[11px] font-bold" style={{ color: impact.color }}>
                    {impact.text}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="px-4 py-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <span className="text-[11px] font-medium flex items-center gap-1 cursor-pointer" style={{ color: '#6366f1' }}>
          View all node details
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2L6.5 5l-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
      </div>
    </div>
  )
}
