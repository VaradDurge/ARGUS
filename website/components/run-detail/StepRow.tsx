'use client'

import { useState } from 'react'
import type { NodeEvent, RunRecord } from '@/lib/types'
import { getStepDisplay, getDetailLines, formatDur, SENTINEL_NODES } from '@/lib/run-utils'
import type { NodeDiffData } from './ReplayControls'
import JsonViewer from '../JsonViewer'
import { Button } from '@/components/ui/button-1'
import { RotateCcw, Play, X, ArrowRight } from 'lucide-react'

function InlineNodeDiff({ diff, onDismiss }: { diff: NodeDiffData; onDismiss?: () => void }) {
  const origDisplay = getStepDisplay(diff.originalStep)
  const replayDisplay = getStepDisplay(diff.replayStep)
  const statusChanged = diff.originalStep.status !== diff.replayStep.status
  const origBad = ['crashed', 'fail', 'semantic_fail'].includes(diff.originalStep.status)
  const replayGood = diff.replayStep.status === 'pass'
  const replayBad = ['crashed', 'fail', 'semantic_fail'].includes(diff.replayStep.status)

  let verdictLabel = 'Changed'
  let verdictColor = '#6b7280'
  let verdictBg = '#6b728010'
  if (statusChanged && origBad && replayGood) {
    verdictLabel = 'FIXED'
    verdictColor = '#10b981'
    verdictBg = '#10b98110'
  } else if (statusChanged && replayBad) {
    verdictLabel = 'REGRESSION'
    verdictColor = '#ef4444'
    verdictBg = '#ef444410'
  } else if (!statusChanged) {
    verdictLabel = 'Unchanged'
  }

  return (
    <div className="mx-4 mb-3 mt-1">
      {/* Dotted separator */}
      <div className="flex items-center gap-2 py-2">
        <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: '#a855f740' }} />
        <span className="text-[10px] uppercase tracking-widest font-semibold shrink-0" style={{ color: '#a855f7' }}>
          node replay diff
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ color: verdictColor, background: verdictBg }}>
          {verdictLabel}
        </span>
        <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: '#a855f740' }} />
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="p-0.5 rounded hover:bg-black/5 transition-colors shrink-0" style={{ color: '#9ca3af' }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Split before/after */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
        <div className="grid grid-cols-2">
          {/* BEFORE */}
          <div className="p-3" style={{ borderRight: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#9ca3af' }}>Before</span>
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
                style={{ background: `${origDisplay.labelColor}12`, color: origDisplay.labelColor, border: `1px solid ${origDisplay.labelColor}25` }}
              >
                {origDisplay.icon} {diff.originalStep.status}
              </span>
              <span className="text-[10px] font-mono italic" style={{ color: '#9ca3af' }}>
                {formatDur(diff.originalStep.duration_ms)}
              </span>
            </div>
            <div className="mb-2">
              <div className="text-[9px] uppercase tracking-widest font-semibold mb-1" style={{ color: '#9ca3af' }}>Output</div>
              {diff.originalStep.output_dict !== null ? (
                <div className="rounded p-2 text-[11px] max-h-[200px] overflow-auto" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <JsonViewer data={diff.originalStep.output_dict} defaultCollapsed={false} />
                </div>
              ) : (
                <div className="text-[11px] italic" style={{ color: '#9ca3af' }}>no output (crashed)</div>
              )}
            </div>
            {diff.originalStep.inspection && diff.originalStep.inspection.severity !== 'ok' && (
              <div>
                <div className="text-[9px] uppercase tracking-widest font-semibold mb-1" style={{ color: '#9ca3af' }}>Inspection</div>
                <div className="rounded p-2 text-[10px] font-mono" style={{ background: '#ef444408', border: '1px solid #ef444420', color: '#ef4444' }}>
                  {diff.originalStep.inspection.message}
                </div>
              </div>
            )}
            {diff.originalStep.exception && (
              <div className="mt-2">
                <div className="text-[9px] uppercase tracking-widest font-semibold mb-1 text-red-400">Exception</div>
                <pre className="text-[10px] text-red-400 bg-red-50 border border-red-200 rounded p-2 overflow-x-auto whitespace-pre-wrap leading-4 font-mono max-h-[120px] overflow-auto">
                  {diff.originalStep.exception}
                </pre>
              </div>
            )}
          </div>

          {/* AFTER */}
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#9ca3af' }}>After</span>
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
                style={{ background: `${replayDisplay.labelColor}12`, color: replayDisplay.labelColor, border: `1px solid ${replayDisplay.labelColor}25` }}
              >
                {replayDisplay.icon} {diff.replayStep.status}
              </span>
              <span className="text-[10px] font-mono italic" style={{ color: '#9ca3af' }}>
                {formatDur(diff.replayStep.duration_ms)}
              </span>
            </div>
            <div className="mb-2">
              <div className="text-[9px] uppercase tracking-widest font-semibold mb-1" style={{ color: '#9ca3af' }}>Output</div>
              {diff.replayStep.output_dict !== null ? (
                <div className="rounded p-2 text-[11px] max-h-[200px] overflow-auto" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <JsonViewer data={diff.replayStep.output_dict} defaultCollapsed={false} />
                </div>
              ) : (
                <div className="text-[11px] italic" style={{ color: '#9ca3af' }}>no output (crashed)</div>
              )}
            </div>
            {diff.replayStep.inspection && diff.replayStep.inspection.severity !== 'ok' && (
              <div>
                <div className="text-[9px] uppercase tracking-widest font-semibold mb-1" style={{ color: '#9ca3af' }}>Inspection</div>
                <div className="rounded p-2 text-[10px] font-mono" style={{ background: '#ef444408', border: '1px solid #ef444420', color: '#ef4444' }}>
                  {diff.replayStep.inspection.message}
                </div>
              </div>
            )}
            {diff.replayStep.exception && (
              <div className="mt-2">
                <div className="text-[9px] uppercase tracking-widest font-semibold mb-1 text-red-400">Exception</div>
                <pre className="text-[10px] text-red-400 bg-red-50 border border-red-200 rounded p-2 overflow-x-auto whitespace-pre-wrap leading-4 font-mono max-h-[120px] overflow-auto">
                  {diff.replayStep.exception}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Status transition footer */}
        {statusChanged && (
          <div className="flex items-center justify-center gap-3 px-4 py-2 font-mono text-[11px]" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
            <span style={{ color: origDisplay.labelColor }}>{origDisplay.icon} {diff.originalStep.status}</span>
            <ArrowRight size={12} style={{ color: '#9ca3af' }} />
            <span style={{ color: replayDisplay.labelColor }}>{replayDisplay.icon} {diff.replayStep.status}</span>
            <span className="font-bold ml-1" style={{ color: verdictColor }}>{verdictLabel}</span>
          </div>
        )}
      </div>

      {/* Dotted end separator */}
      <div className="pt-2">
        <div className="border-t-2 border-dashed" style={{ borderColor: '#a855f740' }} />
      </div>
    </div>
  )
}

export default function StepRow({
  event,
  nameCol,
  run,
  displayIndex,
  onReplay,
  onReplayNode,
  isReplaying,
  nodeDiff,
  onDismissDiff,
}: {
  event: NodeEvent
  nameCol: number
  run: RunRecord
  displayIndex?: number
  onReplay?: (node: string) => void
  onReplayNode?: (node: string) => void
  isReplaying?: boolean
  nodeDiff?: NodeDiffData
  onDismissDiff?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const display = getStepDisplay(event)
  const details = getDetailLines(event, run)
  const number = (displayIndex ?? event.step_index) + 1
  const showActions = !SENTINEL_NODES.has(event.node_name)

  return (
    <div className="group">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left font-mono text-[13px] leading-[34px] flex items-center gap-0 px-4 hover:bg-white/[0.025] transition-colors"
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

        {/* Replaying spinner */}
        {isReplaying && (
          <span className="ml-2 flex items-center gap-1.5 text-[10px] font-medium" style={{ color: '#a855f7' }}>
            <span className="inline-block w-3 h-3 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
            replaying...
          </span>
        )}

        {event.anomaly_signals && event.anomaly_signals.length > 0 && !isReplaying && (
          <span className="ml-2 text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#9ca3af' }}>
            {event.anomaly_signals.length} anomal{event.anomaly_signals.length === 1 ? 'y' : 'ies'}
          </span>
        )}

        {/* Replay action buttons */}
        {showActions && (onReplayNode || onReplay) && !isReplaying && (
          <span className="ml-auto flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onReplayNode && (
              <Button
                variant="dashed"
                size="sm"
                className="font-mono text-[10px] h-6 px-2 text-purple-500 border-purple-300 hover:bg-purple-50 hover:text-purple-600"
                onClick={(e) => { e.stopPropagation(); onReplayNode(event.node_name) }}
              >
                <RotateCcw className="text-purple-400" />
                Replay Node
              </Button>
            )}
            {onReplay && (
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-[10px] h-6 px-2 text-indigo-500 border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
                onClick={(e) => { e.stopPropagation(); onReplay(event.node_name) }}
              >
                <Play className="text-indigo-400" />
                Replay From Here
              </Button>
            )}
          </span>
        )}

        {/* Expand chevron — only when no actions */}
        {!(showActions && (onReplayNode || onReplay)) && (
          <span className="ml-auto text-[10px] text-[#2a2a30] group-hover:text-[#6b7280] transition-colors">
            {expanded ? '\u25BE' : '\u25B8'}
          </span>
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
                {line.indent ? '   ' : '\u2514\u2500'}
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

      {/* Inline node diff — renders right here below this row */}
      {nodeDiff && (
        <InlineNodeDiff diff={nodeDiff} onDismiss={onDismissDiff} />
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
