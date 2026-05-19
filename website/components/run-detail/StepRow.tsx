'use client'

import { useState } from 'react'
import type { NodeEvent, RunRecord } from '@/lib/types'
import { getStepDisplay, getDetailLines, formatDur, SENTINEL_NODES } from '@/lib/run-utils'
import JsonViewer from '../JsonViewer'

function ReplayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="ml-2 shrink-0 font-mono text-[11px] opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded"
      style={{ color: '#6b7280', border: '1px solid #2a2a30' }}
    >
      ↺ replay from here
    </button>
  )
}

export default function StepRow({
  event,
  nameCol,
  run,
  displayIndex,
  onReplay,
}: {
  event: NodeEvent
  nameCol: number
  run: RunRecord
  displayIndex?: number
  onReplay?: (node: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const display = getStepDisplay(event)
  const details = getDetailLines(event, run)
  const number = (displayIndex ?? event.step_index) + 1

  return (
    <div className="group">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left font-mono text-[13px] leading-[34px] flex items-baseline gap-0 px-4 hover:bg-white/[0.025] transition-colors"
      >
        <span className="text-[#9ca3af] w-8 text-right shrink-0 tabular-nums">{number}</span>
        <span className="w-3 shrink-0" />
        <span className="text-[var(--text-primary)] font-semibold shrink-0">{event.node_name}</span>
        {event.behavior_type && (
          <span className="text-[10px] px-1.5 py-0.5 rounded ml-1 shrink-0" style={{ background: 'var(--bg-elevated)', color: '#9ca3af' }}>
            {event.behavior_type}
          </span>
        )}
        <span className="shrink-0" style={{ width: `${Math.max(0, (nameCol - event.node_name.length)) * 0.55 + 1}em` }} />
        <span className="text-[#6b7280] italic w-[5.5em] text-right shrink-0 tabular-nums">{formatDur(event.duration_ms)}</span>
        <span className="w-4 shrink-0" />
        <span style={{ color: display.iconColor }} className="shrink-0 w-4 text-center">{display.icon}</span>
        <span className="w-2 shrink-0" />
        <span style={{ color: display.labelColor }} className="font-bold">
          {display.label}
          {display.warnSuffix && <span style={{ color: '#78716c', fontWeight: 400 }}> (warnings)</span>}
        </span>
        {event.anomaly_signals && event.anomaly_signals.length > 0 && (
          <span className="ml-2 text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#9ca3af' }}>
            {event.anomaly_signals.length} anomal{event.anomaly_signals.length === 1 ? 'y' : 'ies'}
          </span>
        )}
        <span className="ml-auto text-[10px] text-[#2a2a30] group-hover:text-[#6b7280] transition-colors">
          {expanded ? '▾' : '▸'}
        </span>
        {onReplay && !SENTINEL_NODES.has(event.node_name) && (
          <ReplayButton onClick={() => onReplay(event.node_name)} />
        )}
      </button>

      {run.root_cause_chain?.includes(event.node_name) && (
        <div className="font-mono text-[12px] leading-5 pl-4 pb-0.5">
          <span className="w-8 shrink-0 inline-block" />
          <span className="w-3 shrink-0 inline-block" />
          <span className="text-red-400 font-bold">root cause</span>
        </div>
      )}

      {details.length > 0 && (
        <div className="font-mono text-[12px] leading-6 pl-4">
          {details.map((line, i) => (
            <div key={i} className="flex items-baseline">
              <span className="w-8 shrink-0" />
              <span className="w-3 shrink-0" />
              <span className="shrink-0 mr-2" style={{ color: '#9ca3af' }}>
                {line.indent ? '   ' : '└─'}
              </span>
              <span
                style={{
                  color: line.color ?? '#6b7280',
                  fontStyle: line.italic ? 'italic' : undefined,
                  textDecoration: line.underline ? 'underline' : undefined,
                  fontWeight: line.bold ? 700 : undefined,
                }}
              >
                {line.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div
          className="mx-4 mb-3 mt-1 rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {event.input_state !== null && (
              <div className="p-3" style={{ borderRight: '1px solid var(--border-default)' }}>
                <div className="text-[10px] uppercase tracking-widest font-semibold text-[#6b7280] mb-2">Input</div>
                <JsonViewer data={event.input_state} defaultCollapsed={true} />
              </div>
            )}
            {event.output_dict !== null && (
              <div className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-semibold text-[#6b7280] mb-2">Output</div>
                <JsonViewer data={event.output_dict} defaultCollapsed={true} />
              </div>
            )}
          </div>
          {event.exception && (
            <div className="p-3" style={{ borderTop: '1px solid var(--border-default)' }}>
              <div className="text-[10px] uppercase tracking-widest font-semibold text-red-400 mb-2">Full Exception</div>
              <pre className="text-[11px] text-red-200 bg-red-950/20 border border-red-800/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-5 font-mono">
                {event.exception}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
