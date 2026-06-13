'use client'

import type { RunRecord } from '@/lib/types'
import { STATUS_DOT } from '@/lib/run-utils'

export default function StatusCard({ run }: { run: RunRecord }) {
  const statusInfo = STATUS_DOT[run.overall_status] ?? { dot: '\u25CF', color: '#5d6370' }
  const rootCause = run.first_failure_step ?? run.root_cause_chain?.[0]
  const confidence = run.llm_investigation?.confidence ?? null
  const confPct = confidence !== null ? Math.round(confidence * 100) : null
  const confColor = confidence !== null ? (confidence >= 0.75 ? '#3d9e7d' : confidence >= 0.45 ? '#d49a2e' : '#5d6370') : '#5d6370'
  const isHealthy = run.overall_status === 'clean'
  const isCrashed = run.overall_status === 'crashed'
  const statusColor = isHealthy ? '#3d9e7d' : isCrashed ? '#d65c5c' : '#f43f5e'
  const statusLabel = run.overall_status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <div className="card rounded-xl p-3.5 min-h-[130px] max-h-[200px] overflow-y-auto">
      <h3 className="text-[13px] font-bold tracking-[-0.01em] mb-2.5" style={{ color: 'var(--text-primary)' }}>Status</h3>

      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor }} />
        <span className="text-[15px] font-bold tracking-[-0.02em] leading-none" style={{ color: statusColor }}>
          {statusLabel}
        </span>
      </div>

      {rootCause && run.overall_status !== 'clean' && (
        <div className="mb-3">
          <div className="text-[11px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Root Cause</div>
          <span
            className="inline-block max-w-full text-[12px] font-bold px-2 py-1 rounded-md leading-tight break-words"
            style={{ background: 'rgba(244,63,94,0.08)', color: '#e11d48', border: '1px solid rgba(244,63,94,0.12)' }}
          >
            {rootCause}
          </span>
        </div>
      )}

      {confPct !== null && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Confidence</span>
            <span className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--text-secondary)' }}>{confPct}%</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${confPct}%`, background: confColor }} />
            </div>
          </div>
        </div>
      )}

      {run.overall_status === 'clean' && !rootCause && (
        <div className="flex items-center gap-1.5 text-[12.5px]" style={{ color: '#3d9e7d' }}>
          <span className="font-bold">{statusInfo.dot === '●' ? '\u2713' : statusInfo.dot}</span>
          <span className="font-semibold">Pipeline Healthy</span>
        </div>
      )}
    </div>
  )
}
