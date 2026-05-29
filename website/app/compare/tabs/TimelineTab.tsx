'use client'

import type { RunRecord } from '@/lib/types'
import { formatDur } from '@/lib/run-utils'
import { STEP_ICON } from '../lib/compare-utils'

function TimelineColumn({ run, label }: { run: RunRecord; label: string }) {
  const steps = run.steps ?? []
  return (
    <div className="card rounded-xl overflow-hidden flex-1">
      <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
        <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <span className="text-[11px] font-mono ml-2" style={{ color: 'var(--text-muted)' }}>{steps.length} steps</span>
      </div>
      <div className="py-1">
        {steps.map((step, i) => {
          const icon = STEP_ICON[step.status]
          return (
            <div
              key={i}
              className="flex items-center gap-2 px-4 py-1.5 font-mono text-[12px]"
              style={{ borderBottom: i < steps.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
            >
              <span className="w-5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
              <span style={{ color: icon?.color ?? '#9ca3af' }}>{icon?.icon ?? '\u25CF'}</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{step.node_name}</span>
              <span className="ml-auto tabular-nums" style={{ color: 'var(--text-muted)' }}>{formatDur(step.duration_ms)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function TimelineTab({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  return (
    <div className="py-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <TimelineColumn run={runA} label="Base Run" />
      <TimelineColumn run={runB} label="Replay" />
    </div>
  )
}
