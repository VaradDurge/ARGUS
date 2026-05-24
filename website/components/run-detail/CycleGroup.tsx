'use client'

import type { NodeEvent, RunRecord } from '@/lib/types'
import type { NodeDiffData } from './ReplayControls'
import StepRow from './StepRow'

export default function CycleGroup({
  iterations,
  nameCol,
  run,
  onReplay,
  onReplayNode,
  replayingNode,
  nodeDiff,
  onDismissDiff,
}: {
  iterations: NodeEvent[][]
  nameCol: number
  run: RunRecord
  onReplay?: (node: string) => void
  onReplayNode?: (node: string) => void
  replayingNode?: string | null
  nodeDiff?: NodeDiffData | null
  onDismissDiff?: () => void
}) {
  const cycleNodeNames = iterations[0]?.map((e) => e.node_name).join(' \u2192 ') ?? ''
  return (
    <div
      className="mx-3 my-2 rounded-lg overflow-hidden"
      style={{ border: '1px solid rgba(6,182,212,0.25)', background: 'rgba(6,182,212,0.03)' }}
    >
      <div className="px-4 py-1.5 text-[11px] font-mono" style={{ borderBottom: '1px solid rgba(6,182,212,0.15)' }}>
        <span className="text-cyan-400 font-bold">\u21A9 cycle</span>
        <span className="text-[#52525e] ml-3">{cycleNodeNames}</span>
        <span className="text-cyan-400 font-bold ml-3">\u00D7{iterations.length}</span>
      </div>
      {iterations.map((iterEvents, idx) => (
        <div key={idx}>
          {idx > 0 && (
            <div className="mx-4 border-t" style={{ borderColor: 'rgba(6,182,212,0.12)' }} />
          )}
          <div className="px-4 py-1 text-[11px] font-mono text-cyan-400/60">
            iteration {idx + 1}
          </div>
          {iterEvents.map((event, i) => (
            <StepRow
              key={i}
              event={event}
              nameCol={nameCol}
              run={run}
              onReplay={onReplay}
              onReplayNode={onReplayNode}
              isReplaying={replayingNode === event.node_name}
              nodeDiff={nodeDiff?.nodeName === event.node_name ? nodeDiff : undefined}
              onDismissDiff={onDismissDiff}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
