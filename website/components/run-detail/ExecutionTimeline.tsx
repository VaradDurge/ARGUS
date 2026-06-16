'use client'

import type { RunRecord } from '@/lib/types'
import { SENTINEL_NODES } from '@/lib/run-utils'
import { topologyLines, segmentEvents } from '@/lib/topology'
import type { NodeDiffData } from './ReplayControls'
import StepRow from './StepRow'
import ParallelGroup from './ParallelGroup'
import CycleGroup from './CycleGroup'

export default function ExecutionTimeline({
  run,
  onReplay,
  onReplayNode,
  replayingNode,
  nodeDiff,
  onDismissDiff,
}: {
  run: RunRecord
  onReplay: (node: string) => void
  onReplayNode?: (node: string) => void
  replayingNode?: string | null
  nodeDiff?: NodeDiffData | null
  onDismissDiff?: () => void
}) {
  const steps = run.steps ?? []
  const nameCol = steps.length > 0 ? Math.max(...steps.map((e) => e.node_name.length)) + 2 : 10
  const displayNodes = (run.graph_node_names ?? []).filter((n) => !SENTINEL_NODES.has(n))
  const topo = displayNodes.length > 1 ? topologyLines(run.graph_edge_map ?? {}, run.graph_node_names ?? []) : []
  const segments = segmentEvents(steps, run.graph_edge_map)

  let globalIdx = 0

  return (
    <div className="flex flex-col gap-6">
      {/* ASCII execution tree */}
      {topo.length > 0 && (
        <section className="overflow-hidden rounded-[10px] border border-border bg-card">
          <div className="border-b border-border px-4 py-2" style={{ background: 'var(--code-header)' }}>
            <span className="font-mono text-[11px] text-muted-foreground">execution tree</span>
          </div>
          <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-relaxed text-[#bcbcbc]">
            {topo.map((line, i) => {
              const hasFail = line.includes('✗') || line.includes('✘')
              return (
                <div key={i} style={{ color: hasFail ? 'var(--failure)' : undefined }}>
                  {line}
                </div>
              )
            })}
          </pre>
        </section>
      )}

      {/* Step cards */}
      <section className="flex flex-col gap-2">
        {segments.map((seg, si) => {
          if (seg.type === 'normal') {
            const rows = seg.events.map((event) => {
              const idx = globalIdx++
              return (
                <StepRow
                  key={idx}
                  event={event}
                  nameCol={nameCol}
                  run={run}
                  displayIndex={idx}
                  onReplay={onReplay}
                  onReplayNode={onReplayNode}
                  isReplaying={replayingNode === event.node_name}
                  nodeDiff={nodeDiff?.nodeName === event.node_name ? nodeDiff : undefined}
                  onDismissDiff={onDismissDiff}
                />
              )
            })
            return <div key={si} className="flex flex-col gap-2">{rows}</div>
          }
          if (seg.type === 'parallel') {
            const startIdx = globalIdx
            globalIdx += seg.events.length
            return <ParallelGroup key={si} events={seg.events} nameCol={nameCol} run={run} startIndex={startIdx} onReplay={onReplay} onReplayNode={onReplayNode} replayingNode={replayingNode} nodeDiff={nodeDiff} onDismissDiff={onDismissDiff} />
          }
          const startIdx = globalIdx
          for (const iter of seg.iterations) globalIdx += iter.length
          return <CycleGroup key={si} iterations={seg.iterations} nameCol={nameCol} run={run} startIndex={startIdx} onReplay={onReplay} onReplayNode={onReplayNode} replayingNode={replayingNode} nodeDiff={nodeDiff} onDismissDiff={onDismissDiff} />
        })}
      </section>
    </div>
  )
}
