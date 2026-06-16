'use client'

import type { NodeEvent, RunRecord } from '@/lib/types'
import type { NodeDiffData } from './ReplayControls'
import StepRow from './StepRow'

export default function ParallelGroup({
  events,
  nameCol,
  run,
  startIndex,
  onReplay,
  onReplayNode,
  replayingNode,
  nodeDiff,
  onDismissDiff,
}: {
  events: NodeEvent[]
  nameCol: number
  run: RunRecord
  startIndex?: number
  onReplay?: (node: string) => void
  onReplayNode?: (node: string) => void
  replayingNode?: string | null
  nodeDiff?: NodeDiffData | null
  onDismissDiff?: () => void
}) {
  const nodeNames = events.map((e) => e.node_name).join(' · ')
  return (
    <div className="flex flex-col gap-2">
      {/* Parallel group header */}
      <div className="flex items-center gap-2 px-1">
        <span className="rounded-[4px] bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
          parallel
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {nodeNames}
        </span>
      </div>
      {events.map((event, i) => (
        <StepRow
          key={i}
          event={event}
          nameCol={nameCol}
          run={run}
          displayIndex={(startIndex ?? 0) + i}
          onReplay={onReplay}
          onReplayNode={onReplayNode}
          isReplaying={replayingNode === event.node_name}
          nodeDiff={nodeDiff?.nodeName === event.node_name ? nodeDiff : undefined}
          onDismissDiff={onDismissDiff}
        />
      ))}
    </div>
  )
}
