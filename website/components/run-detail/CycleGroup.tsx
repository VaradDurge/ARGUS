'use client'

import type { NodeEvent, RunRecord } from '@/lib/types'
import type { NodeDiffData } from './ReplayControls'
import StepRow from './StepRow'

export default function CycleGroup({
  iterations,
  nameCol,
  run,
  startIndex,
  onReplay,
  onReplayNode,
  replayingNode,
  nodeDiff,
  onDismissDiff,
}: {
  iterations: NodeEvent[][]
  nameCol: number
  run: RunRecord
  startIndex?: number
  onReplay?: (node: string) => void
  onReplayNode?: (node: string) => void
  replayingNode?: string | null
  nodeDiff?: NodeDiffData | null
  onDismissDiff?: () => void
}) {
  const cycleNodeNames = iterations[0]?.map((e) => e.node_name).join(' \u2192 ') ?? ''
  let idx = startIndex ?? 0

  return (
    <div className="flex flex-col gap-2">
      {/* Cycle group header */}
      <div className="flex items-center gap-2 px-1">
        <span className="rounded-[4px] bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
          cycle
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {cycleNodeNames}
        </span>
        <span className="font-mono text-[11px] font-bold text-text-tertiary">
          ×{iterations.length}
        </span>
      </div>
      {iterations.map((iterEvents, iterIdx) => {
        const iterRows = iterEvents.map((event) => {
          const currentIdx = idx++
          return (
            <StepRow
              key={currentIdx}
              event={event}
              nameCol={nameCol}
              run={run}
              displayIndex={currentIdx}
              onReplay={onReplay}
              onReplayNode={onReplayNode}
              isReplaying={replayingNode === event.node_name}
              nodeDiff={nodeDiff?.nodeName === event.node_name ? nodeDiff : undefined}
              onDismissDiff={onDismissDiff}
            />
          )
        })
        return (
          <div key={iterIdx} className="flex flex-col gap-2">
            {iterIdx > 0 && (
              <div className="px-1">
                <span className="font-mono text-[10px] text-text-tertiary">
                  iteration {iterIdx + 1}
                </span>
              </div>
            )}
            {iterRows}
          </div>
        )
      })}
    </div>
  )
}
