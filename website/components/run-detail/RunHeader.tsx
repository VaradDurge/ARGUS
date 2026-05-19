'use client'

import Link from 'next/link'
import type { RunRecord } from '@/lib/types'
import { STATUS_DOT, formatDur, formatTimestamp } from '@/lib/run-utils'

const STATUS_BG: Record<string, string> = {
  clean: 'rgba(16,185,129,0.08)',
  silent_failure: 'rgba(245,158,11,0.08)',
  crashed: 'rgba(239,68,68,0.08)',
  semantic_fail: 'rgba(168,85,247,0.08)',
  interrupted: 'rgba(245,158,11,0.08)',
}

const STATUS_TEXT: Record<string, string> = {
  clean: '#10b981',
  silent_failure: '#f59e0b',
  crashed: '#ef4444',
  semantic_fail: '#a855f7',
  interrupted: '#f59e0b',
}

export default function RunHeader({
  run,
  actions,
}: {
  run: RunRecord
  actions?: React.ReactNode
}) {
  const statusInfo = STATUS_DOT[run.overall_status] ?? { dot: '\u25CF', color: '#9ca3af' }
  const steps = run.steps ?? []

  return (
    <div className="space-y-4">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
              <span style={{ color: statusInfo.color }} className="text-lg leading-none">{statusInfo.dot}</span>
              <span className="font-mono text-base" style={{ color: '#111827' }}>{run.run_id}</span>
            </h1>
            <span
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
              style={{
                background: STATUS_BG[run.overall_status] ?? 'rgba(156,163,175,0.08)',
                color: STATUS_TEXT[run.overall_status] ?? '#9ca3af',
                border: `1px solid ${STATUS_TEXT[run.overall_status] ?? '#9ca3af'}20`,
              }}
            >
              {run.overall_status.replace('_', ' ')}
            </span>
          </div>

          {/* Metadata row */}
          <div className="mt-3 flex items-center gap-2 flex-wrap text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            <span>{formatTimestamp(run.started_at)}</span>
            <span style={{ color: 'var(--text-faint)' }}>&middot;</span>
            <span>{formatDur(run.duration_ms)}</span>
            <span style={{ color: 'var(--text-faint)' }}>&middot;</span>
            <span>{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
            <span style={{ color: 'var(--text-faint)' }}>&middot;</span>
            <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>v{run.argus_version}</span>
            {run.is_cyclic && (
              <>
                <span style={{ color: 'var(--text-faint)' }}>&middot;</span>
                <span style={{ color: '#a855f7' }}>cyclic</span>
              </>
            )}
          </div>

          {/* Replay lineage */}
          {run.parent_run_id && (
            <div className="mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              replay of{' '}
              <a href={`/runs/${run.parent_run_id}`} className="font-mono hover:text-indigo-500 transition-colors">
                {run.parent_run_id}
              </a>
              {run.replay_from_step && (
                <>
                  {' '}from{' '}
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{run.replay_from_step}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <Link
            href={`/compare?a=${run.run_id}`}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3.5 py-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}
          >
            Compare
          </Link>
        </div>
      </div>
    </div>
  )
}
