'use client'

import type { NodeEvent, RunRecord } from '@/lib/types'
import StepRow from './StepRow'

export default function ParallelGroup({
  events,
  nameCol,
  run,
  onReplay,
}: {
  events: NodeEvent[]
  nameCol: number
  run: RunRecord
  onReplay?: (node: string) => void
}) {
  const nodeNames = events.map((e) => e.node_name).join(' · ')
  return (
    <div
      className="mx-3 my-2 rounded-lg overflow-hidden"
      style={{ border: '1px solid rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.03)' }}
    >
      <div className="px-4 py-1.5 text-[11px] font-mono" style={{ borderBottom: '1px solid rgba(59,130,246,0.15)' }}>
        <span className="text-blue-400 font-bold">⟼ parallel</span>
        <span className="text-[#52525e] ml-3">{nodeNames}</span>
      </div>
      {events.map((event, i) => (
        <StepRow key={i} event={event} nameCol={nameCol} run={run} onReplay={onReplay} />
      ))}
    </div>
  )
}
