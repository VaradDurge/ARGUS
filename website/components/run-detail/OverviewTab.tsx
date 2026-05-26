'use client'

import type { RunRecord, RunSummary } from '@/lib/types'
import { formatDur } from '@/lib/run-utils'
import StatusCard from './StatusCard'
import PipelineOverview from './PipelineOverview'
import MetricsGrid from './MetricsGrid'
import ReplayBranches from './ReplayBranches'

/* ── AI Analysis Summary Card (compact) ─────────────────────── */

function AIAnalysisSummaryCard({ run, onViewFull }: { run: RunRecord; onViewFull: () => void }) {
  const inv = run.llm_investigation
  if (!inv || !inv.triggered) {
    return (
      <div className="card rounded-xl p-3.5">
        <h3 className="text-[13px] font-bold tracking-[-0.01em] mb-1.5" style={{ color: 'var(--text-primary)' }}>AI Analysis</h3>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No AI analysis available for this run.</p>
      </div>
    )
  }

  const confPct = Math.round(inv.confidence * 100)
  const confColor = inv.confidence >= 0.75 ? '#10b981' : inv.confidence >= 0.45 ? '#f59e0b' : '#9ca3af'
  const rootCauseNode = run.root_cause_chain?.[0] ?? run.first_failure_step
  const rootCauseStep = run.steps?.findIndex((s) => s.node_name === rootCauseNode)

  return (
    <div className="card rounded-xl p-3.5" style={{ border: '1px solid rgba(99,102,241,0.10)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 1l1.5 3.5L13 6l-3 2 .5 4L8 10.5 5.5 12l.5-4-3-2 3.5-1.5L8 1Z" fill="rgba(99,102,241,0.10)" stroke="#6366f1" strokeWidth="1"/>
          </svg>
          <span className="text-[13px] font-bold tracking-[-0.01em]" style={{ color: '#6366f1' }}>AI Analysis</span>
        </div>
        <span
          className="text-[10.5px] font-medium px-2 py-0.5 rounded-full leading-none"
          style={{ color: confColor, background: `${confColor}0a`, border: `1px solid ${confColor}18` }}
        >
          {confPct}%
        </span>
      </div>

      <div className="space-y-1">
        {rootCauseNode && (
          <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text-primary)' }}>
            <span className="font-semibold">Root cause: </span>
            <span className="font-mono font-semibold" style={{ color: '#ef4444' }}>{rootCauseNode}</span>
            {rootCauseStep !== undefined && rootCauseStep >= 0 && (
              <span style={{ color: 'var(--text-muted)' }}> (step {rootCauseStep + 1})</span>
            )}
          </p>
        )}
        {inv.root_cause_explanation && (
          <p className="text-[12px] font-normal leading-snug" style={{ color: 'var(--text-secondary)', maxWidth: '500px' }}>
            {inv.root_cause_explanation.length > 120
              ? inv.root_cause_explanation.slice(0, 120) + '...'
              : inv.root_cause_explanation}
          </p>
        )}
      </div>

      <button
        onClick={onViewFull}
        className="mt-2 text-[11.5px] font-semibold inline-flex items-center gap-1 transition-colors"
        style={{ color: '#6366f1' }}
      >
        View Full Analysis
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 3L7.5 6l-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </div>
  )
}

/* ── Execution Timeline Card ─────────────────────────────────── */

function stepVisual(status: string): { color: string; bg: string; borderColor: string; icon: 'check' | 'warn' | 'x' | 'down' | null } {
  if (status === 'pass')          return { color: '#10b981', bg: 'rgba(16,185,129,0.10)',  borderColor: 'rgba(16,185,129,0.25)',  icon: 'check' }
  if (status === 'crashed')       return { color: '#ef4444', bg: 'rgba(239,68,68,0.10)',   borderColor: 'rgba(239,68,68,0.25)',   icon: 'x'     }
  if (status === 'fail')          return { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  borderColor: 'rgba(245,158,11,0.25)',  icon: 'warn'  }
  if (status === 'semantic_fail') return { color: '#a855f7', bg: 'rgba(168,85,247,0.10)',  borderColor: 'rgba(168,85,247,0.25)',  icon: 'warn'  }
  if (status === 'interrupted')   return { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  borderColor: 'rgba(245,158,11,0.25)',  icon: 'down'  }
  if (status === 'degraded_input')return { color: '#f97316', bg: 'rgba(249,115,22,0.10)',  borderColor: 'rgba(249,115,22,0.25)',  icon: 'down'  }
  return                                 { color: '#9ca3af', bg: 'rgba(156,163,175,0.10)', borderColor: 'rgba(156,163,175,0.25)', icon: null    }
}

function StatusCircleIcon({ icon, color }: { icon: ReturnType<typeof stepVisual>['icon']; color: string }) {
  const size = 22
  if (icon === 'check') return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="13" fill={`${color}15`} stroke={color} strokeWidth="1.5"/>
      <path d="M9.5 14.5l3 3 6-6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  if (icon === 'warn') return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="13" fill={`${color}15`} stroke={color} strokeWidth="1.5"/>
      <path d="M14 8.5l5.5 9.5H8.5L14 8.5Z" stroke={color} strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M14 12.5v2.5" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="14" cy="17" r="0.6" fill={color}/>
    </svg>
  )
  if (icon === 'x') return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="13" fill={`${color}15`} stroke={color} strokeWidth="1.5"/>
      <path d="M10 10l8 8M18 10l-8 8" stroke={color} strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  )
  if (icon === 'down') return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="13" fill={`${color}15`} stroke={color} strokeWidth="1.5"/>
      <path d="M14 9.5v8M10.5 14l3.5 4 3.5-4" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  return null
}

function ExecutionTimelineCard({ run }: { run: RunRecord }) {
  const steps = run.steps ?? []
  const firstFailIdx = run.first_failure_step
    ? steps.findIndex((s) => s.node_name === run.first_failure_step)
    : -1

  return (
    <div className="card rounded-xl overflow-hidden">
      <div className="px-3.5 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <h3 className="text-[13px] font-bold tracking-[-0.01em]" style={{ color: 'var(--text-primary)' }}>Execution Timeline</h3>
      </div>

      <div className="px-2.5 py-2">
        {steps.map((step, i) => {
          const isDegraded = firstFailIdx >= 0 && step.step_index > firstFailIdx && run.overall_status !== 'clean'
          const effectiveStatus = isDegraded && step.status === 'pass' ? 'degraded_input' : step.status
          const v = stepVisual(effectiveStatus)
          const isFailed = step.status !== 'pass'
          const inspection = step.inspection
          const isLast = i === steps.length - 1

          // The output field tag: behavior_type or first missing field
          const outputTag = step.behavior_type
            ?? inspection?.missing_fields?.[0]
            ?? null

          return (
            <div key={i} className="flex gap-2">
              {/* Left: numbered circle + vertical line */}
              <div className="flex flex-col items-center shrink-0 pt-[5px]" style={{ width: 22 }}>
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 z-10 text-[9px] font-bold tabular-nums"
                  style={{ background: `${v.color}18`, color: v.color }}
                >
                  {i + 1}
                </span>
                {!isLast && (
                  <div
                    className="flex-1 w-[1.5px]"
                    style={{ background: `${v.color}20`, minHeight: 12 }}
                  />
                )}
              </div>

              {/* Right: row content */}
              <div className="flex-1 min-w-0 pb-0.5">
                {/* Main row */}
                <div
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                  style={{
                    background: isFailed ? `${v.color}04` : 'transparent',
                    border: isFailed ? `1px solid ${v.color}12` : '1px solid transparent',
                  }}
                >
                  {/* Node name */}
                  <span className="text-[12px] font-semibold tracking-[-0.01em] shrink-0" style={{ color: 'var(--text-primary)' }}>
                    {step.node_name}
                  </span>

                  {/* Output type tag */}
                  {outputTag && (
                    <span
                      className="text-[9.5px] font-medium px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: 'rgba(246,247,249,0.6)', color: 'var(--text-muted)' }}
                    >
                      {outputTag}
                    </span>
                  )}

                  <div className="flex-1" />

                  {/* Duration */}
                  <span className="text-[10.5px] font-medium tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {formatDur(step.duration_ms)}
                  </span>
                </div>

                {/* Error detail block */}
                {isFailed && (inspection?.message || inspection?.missing_fields?.length) && (
                  <div
                    className="mt-0.5 ml-3 px-2 py-1 rounded text-[10.5px] leading-snug"
                    style={{
                      background: `${v.color}05`,
                      borderLeft: `2px solid ${v.color}40`,
                    }}
                  >
                    {inspection?.is_silent_failure && inspection.message && (
                      <div className="font-medium" style={{ color: v.color }}>
                        {inspection.message}
                      </div>
                    )}
                    {inspection?.missing_fields?.length ? (
                      <div className="mt-0.5 font-normal" style={{ color: 'var(--text-muted)' }}>
                        Incomplete state received
                      </div>
                    ) : (!inspection?.is_silent_failure && inspection?.message) ? (
                      <div className="font-normal" style={{ color: v.color }}>{inspection.message}</div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Overview Tab ────────────────────────────────────────────── */

type Tab = 'Overview' | 'Pipeline' | 'AI Analysis' | 'Correlations' | 'State' | 'Logs'

export default function OverviewTab({ run, allRuns, onSwitchTab }: { run: RunRecord; allRuns: RunSummary[]; onSwitchTab: (tab: Tab) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3">
      <div className="lg:col-span-4">
        <StatusCard run={run} />
      </div>
      <div className="lg:col-span-8">
        <PipelineOverview run={run} onViewFull={() => onSwitchTab('Pipeline')} />
      </div>
      <div className="lg:col-span-6">
        <MetricsGrid run={run} compact />
      </div>
      <div className="lg:col-span-6">
        <AIAnalysisSummaryCard run={run} onViewFull={() => onSwitchTab('AI Analysis')} />
      </div>
      <div className="lg:col-span-6">
        <ExecutionTimelineCard run={run} />
      </div>
      <div className="lg:col-span-6">
        <ReplayBranches run={run} allRuns={allRuns} onSwitchTab={onSwitchTab} />
      </div>
    </div>
  )
}
