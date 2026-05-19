'use client'

import type { RunRecord } from '@/lib/types'
import { SENTINEL_NODES } from '@/lib/run-utils'
import { topologyLines, segmentEvents } from '@/lib/topology'
import StepRow from './StepRow'
import ParallelGroup from './ParallelGroup'
import CycleGroup from './CycleGroup'

export default function ExecutionTimeline({
  run,
  onReplay,
}: {
  run: RunRecord
  onReplay: (node: string) => void
}) {
  const steps = run.steps ?? []
  const nameCol = steps.length > 0 ? Math.max(...steps.map((e) => e.node_name.length)) + 2 : 10
  const displayNodes = (run.graph_node_names ?? []).filter((n) => !SENTINEL_NODES.has(n))
  const topo = displayNodes.length > 1 ? topologyLines(run.graph_edge_map ?? {}, run.graph_node_names ?? []) : []
  const segments = segmentEvents(steps, run.graph_edge_map)

  let globalIdx = 0

  return (
    <div>
      {/* Section heading */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[12px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
          Execution
        </span>
        <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {steps.length} step{steps.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Execution card */}
      <div className="card rounded-xl overflow-hidden">
        {/* Header bar */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}
        >
          <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            Pipeline Trace
          </span>
          <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {run.run_id.slice(0, 12)}&hellip;
          </span>
        </div>

        {/* Graph topology */}
        {topo.length > 0 && (
          <div className="py-3 font-mono">
            <div className="px-5 leading-6 text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>graph</div>
            <div className="px-5">
              {topo.map((line, i) => (
                <div key={i} className="text-[12px] leading-6 whitespace-pre" style={{ color: 'var(--text-muted)' }}>{line}</div>
              ))}
            </div>
            <div className="mt-3 mx-5" style={{ height: '1px', background: 'var(--border-subtle)' }} />
          </div>
        )}

        {/* Node steps */}
        <div className="py-2 font-mono text-[13px]">
          {segments.map((seg, si) => {
            if (seg.type === 'normal') {
              const rows = seg.events.map((event) => {
                const idx = globalIdx++
                return <StepRow key={idx} event={event} nameCol={nameCol} run={run} displayIndex={idx} onReplay={onReplay} />
              })
              return <div key={si}>{rows}</div>
            }
            if (seg.type === 'parallel') {
              globalIdx += seg.events.length
              return <ParallelGroup key={si} events={seg.events} nameCol={nameCol} run={run} onReplay={onReplay} />
            }
            for (const iter of seg.iterations) globalIdx += iter.length
            return <CycleGroup key={si} iterations={seg.iterations} nameCol={nameCol} run={run} onReplay={onReplay} />
          })}
          <div className="h-2" />
        </div>
      </div>
    </div>
  )
}
