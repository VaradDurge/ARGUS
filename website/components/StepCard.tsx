'use client'

import { useState } from 'react'
import type { NodeEvent } from '@/lib/types'
import { StepStatusBadge, SeverityBadge } from './StatusBadge'
import JsonViewer from './JsonViewer'

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

interface StepCardProps {
  step: NodeEvent
  defaultOpen?: boolean
  isBreakpoint?: boolean
  isDimmed?: boolean
}

export default function StepCard({ step, defaultOpen = false, isBreakpoint = false, isDimmed = false }: StepCardProps) {
  const [open, setOpen] = useState(defaultOpen)

  const hasIssues = step.status !== 'pass' || (step.inspection && step.inspection.severity !== 'ok')
  const isPass = step.status === 'pass' && !hasIssues

  const borderColor = isBreakpoint
    ? '#ef4444'
    : hasIssues
    ? 'rgba(239,68,68,0.3)'
    : 'var(--border-default)'

  const bgColor = isBreakpoint
    ? 'rgba(239,68,68,0.08)'
    : 'var(--bg-surface)'

  return (
    <div className={isDimmed ? 'opacity-45 saturate-50' : undefined}>
      <div
        className="rounded-lg relative overflow-hidden"
        style={{
          border: `1px solid ${borderColor}`,
          background: bgColor,
          boxShadow: isBreakpoint ? '0 0 28px rgba(239,68,68,0.18)' : '0 8px 18px rgba(0,0,0,0.2)',
        }}
      >
        {/* Breakpoint accent */}
        {isBreakpoint && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500/80" />
        )}

        {/* Header */}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
        >
          <span className={`font-mono text-xs w-5 shrink-0 tabular-nums ${isBreakpoint ? 'text-red-400' : 'text-[#35353e]'}`}>
            {step.step_index}
          </span>

          <span className="text-[#52525e] text-xs shrink-0">{open ? '▾' : '▸'}</span>

          <span className={`text-sm font-mono flex-1 truncate ${isPass ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
            {step.node_name}
            {step.is_subgraph_entry && (
              <span className="ml-2 text-[10px] text-[#52525e] border border-[var(--border-subtle)] px-1 rounded">
                ↳ sub
              </span>
            )}
          </span>

          <StepStatusBadge status={step.status} />

          <span className="font-mono text-[var(--text-secondary)] text-xs w-14 text-right shrink-0">
            {formatDuration(step.duration_ms)}
          </span>
        </button>

        {/* Expanded */}
        {open && (
          <div
            className="px-4 py-4 space-y-5"
            style={{ borderTop: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}
          >
            {step.attempt_index > 0 && (
              <div className="text-xs text-[#8a8a96] font-mono border border-[var(--border-subtle)] rounded px-2 py-1 w-fit">
                attempt #{step.attempt_index}
              </div>
            )}

            {/* Exception — most important, show first */}
            {step.exception && (
              <div>
                <div className="text-[10px] uppercase tracking-widest font-semibold text-red-400 mb-2">Exception</div>
                <pre className="text-xs text-red-300/80 bg-red-950/15 border border-red-900/25 rounded-lg p-3.5 overflow-x-auto whitespace-pre-wrap leading-5 font-mono">
                  {step.exception}
                </pre>
              </div>
            )}

            {/* Inspection issues */}
            {step.inspection && step.inspection.severity !== 'ok' && (
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-widest font-semibold text-[#52525e]">Inspection</div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <SeverityBadge severity={step.inspection.severity} />
                  <span className="text-xs text-[#8a8a96]">{step.inspection.message}</span>
                </div>

                {step.inspection.missing_fields.length > 0 && (
                  <div className="text-xs">
                    <span className="text-amber-400">missing fields: </span>
                    <span className="text-[#e2e2e6] font-mono">{step.inspection.missing_fields.join(', ')}</span>
                  </div>
                )}

                {step.inspection.empty_fields.length > 0 && (
                  <div className="text-xs">
                    <span className="text-[#52525e]">empty optional: </span>
                    <span className="text-[#8a8a96] font-mono">{step.inspection.empty_fields.join(', ')}</span>
                  </div>
                )}

                {step.inspection.type_mismatches.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-[#52525e]">type mismatches:</div>
                    {step.inspection.type_mismatches.map((m, i) => (
                      <div key={i} className="text-xs font-mono pl-2">
                        <span className="text-blue-400">{m.field_name}</span>
                        <span className="text-[#52525e]"> expected </span>
                        <span className="text-green-400">{m.expected_type}</span>
                        <span className="text-[#52525e]"> got </span>
                        <span className="text-amber-400">{m.actual_type}</span>
                      </div>
                    ))}
                  </div>
                )}

                {step.inspection.tool_failures.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs text-[#52525e]">tool failures:</div>
                    {step.inspection.tool_failures.map((tf, i) => (
                      <div
                        key={i}
                        className="text-xs rounded-lg px-3 py-2 border"
                        style={
                          tf.severity === 'critical'
                            ? { background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }
                            : { background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' }
                        }
                      >
                        <span className={tf.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}>
                          {tf.failure_type}
                        </span>
                        <span className="text-[#52525e]"> · field: </span>
                        <span className="text-[#e2e2e6] font-mono">{tf.field_name}</span>
                        <div className="text-[#52525e] mt-0.5 font-mono text-[11px]">{tf.evidence}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Validators */}
            {step.validator_results.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest font-semibold text-[#52525e] mb-2">Validators</div>
                <div className="space-y-1">
                  {step.validator_results.map((v, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs">
                      <span className={v.is_valid ? 'text-green-400' : 'text-red-400'}>{v.is_valid ? '✓' : '✗'}</span>
                      <span className="text-[#52525e]">{v.validator_name}</span>
                      {v.message && <span className="text-[#8a8a96]">{v.message}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Input / Output side by side or stacked */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {step.input_state !== null && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest font-semibold text-[#52525e] mb-2">Input</div>
                  <JsonViewer data={step.input_state} defaultCollapsed={true} />
                </div>
              )}
              {step.output_dict !== null && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest font-semibold text-[#52525e] mb-2">Output</div>
                  <JsonViewer data={step.output_dict} defaultCollapsed={true} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
