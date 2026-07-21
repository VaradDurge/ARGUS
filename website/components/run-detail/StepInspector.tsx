'use client'

import { useState } from 'react'
import {
  Info,
  X as XIcon,
  ChevronRight,
  ChevronDown,
  Check,
  AlertTriangle,
  Brain,
  ShieldCheck,
  Bug,
  Activity,
  ArrowRight,
  Layers,
} from 'lucide-react'
import type { RunRecord, NodeEvent, ToolFailure, SemanticSignal, AnomalySignal } from '@/lib/types'
import { formatDur } from '@/lib/run-utils'
import { getFailureMeta } from '@/lib/failure-labels'
import JsonViewer from '@/components/JsonViewer'

/* ── Helpers ────────────────────────────────────────────────────── */

function statusBadge(status: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pass:           { label: 'Passed',        color: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
    crashed:        { label: 'Crashed',       color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
    fail:           { label: 'Failed',        color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
    semantic_fail:  { label: 'Semantic Fail', color: '#a855f7', bg: 'rgba(168,85,247,0.10)' },
    interrupted:    { label: 'Interrupted',   color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
    degraded_input: { label: 'Degraded',      color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
  }
  return map[status] ?? { label: status, color: '#6b7280', bg: 'rgba(107,114,128,0.08)' }
}

function SectionHeader({ icon: Icon, label, color, count }: {
  icon: typeof AlertTriangle
  label: string
  color?: string
  count?: number
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className="size-3" style={{ color: color ?? 'var(--muted-foreground)' }} />
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: color ?? 'var(--muted-foreground)' }}>
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span
          className="text-[10px] font-bold px-1.5 py-px rounded-full ml-0.5"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted-foreground)' }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

function CategoryPill({ category, color }: { category: string; color: string }) {
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-px rounded"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
      }}
    >
      {category}
    </span>
  )
}

function CollapsibleJson({ label, data }: { label: string; data: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false)
  if (!data || Object.keys(data).length === 0) return null
  return (
    <div>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-1.5 py-1.5 text-left text-[13px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span className="font-medium">{label}</span>
        <span className="font-mono text-[11px] text-muted-foreground/60">{Object.keys(data).length} keys</span>
      </button>
      {open && (
        <div className="mt-1.5 mb-1">
          <JsonViewer data={data} />
        </div>
      )}
    </div>
  )
}

/* ── Primary Finding ────────────────────────────────────────────── */

function derivePrimaryFinding(step: NodeEvent): { text: string; color: string } | null {
  if (step.status === 'crashed' && step.exception) {
    const first = step.exception.split('\n').filter(Boolean).pop() ?? step.exception
    return { text: first.trim(), color: '#ef4444' }
  }
  const insp = step.inspection
  if (!insp) return null

  const criticals = insp.tool_failures.filter((f) => f.severity === 'critical')
  if (criticals.length > 0) {
    const meta = getFailureMeta(criticals[0].failure_type)
    return {
      text: `${meta.label}: ${criticals[0].evidence}`,
      color: '#ef4444',
    }
  }
  if (insp.is_silent_failure && insp.missing_fields.length > 0) {
    return {
      text: `Missing fields will break downstream: ${insp.missing_fields.join(', ')}`,
      color: '#ef4444',
    }
  }
  if (step.status === 'semantic_fail') {
    const reason = step.semantic_check?.reason ?? 'Output failed semantic coherence check'
    return { text: reason, color: '#a855f7' }
  }
  const warnings = insp.tool_failures.filter((f) => f.severity === 'warning')
  if (warnings.length > 0) {
    const meta = getFailureMeta(warnings[0].failure_type)
    return {
      text: `${meta.label}: ${warnings[0].evidence}`,
      color: '#f59e0b',
    }
  }
  return null
}

/* ── Decision Explanation ───────────────────────────────────────── */

function deriveFixHint(step: NodeEvent, run: RunRecord): string | null {
  const inv = run.llm_investigation
  if (inv?.triggered && inv.debugging_suggestions?.length) return inv.debugging_suggestions[0].split('\n')[0]
  if (run.correlation?.causal_summary) return run.correlation.causal_summary
  if (step.inspection?.degraded_upstream_node) return `Check upstream node "${step.inspection.degraded_upstream_node}" — it failed to produce required fields`
  return null
}

function DecisionExplanation({ step, run }: { step: NodeEvent; run: RunRecord }) {
  const status = step.status
  if (status === 'pass' || status === 'interrupted' || status === 'skipped' || status === 'retried') return null

  const insp = step.inspection
  const sc = step.semantic_check
  const anomalies = step.anomaly_signals ?? []
  const failedValidators = step.validator_results.filter((v) => !v.is_valid)
  const toolFailures = insp?.tool_failures ?? []
  const semanticSignals = insp?.semantic_signals ?? []

  // Don't render if there's nothing to explain
  const hasContent = sc || anomalies.length > 0 || failedValidators.length > 0 || toolFailures.length > 0 || semanticSignals.length > 0
  if (!hasContent) return null

  const accentColor = status === 'semantic_fail' ? '#a855f7'
    : status === 'crashed' ? '#ef4444'
    : status === 'degraded_input' ? '#f59e0b'
    : '#f59e0b'

  const fixHint = deriveFixHint(step, run)

  return (
    <div
      className="mt-4 rounded-xl overflow-hidden"
      style={{
        background: `color-mix(in srgb, ${accentColor} 3%, var(--card))`,
        border: `1px solid color-mix(in srgb, ${accentColor} 18%, transparent)`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid color-mix(in srgb, ${accentColor} 10%, transparent)` }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke={accentColor} strokeWidth="1.5" fill="none" opacity="0.5" />
          <text x="8" y="12" textAnchor="middle" fill={accentColor} fontSize="11" fontWeight="bold">?</text>
        </svg>
        <span className="text-[13px] font-bold" style={{ color: accentColor, letterSpacing: '-0.01em' }}>
          Why This Was Flagged
        </span>
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">

        {/* Rules Triggered — validators + tool failures + semantic signals */}
        {(failedValidators.length > 0 || toolFailures.length > 0 || semanticSignals.length > 0) && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Rules Triggered</p>
            <div className="flex flex-col gap-1">
              {failedValidators.map((v, i) => (
                <div key={`v-${i}`} className="flex items-start gap-2 text-[12.5px]">
                  <span className="mt-0.5 shrink-0 text-[11px]" style={{ color: '#a855f7' }}>⊗</span>
                  <div className="min-w-0">
                    <span className="font-mono font-semibold text-foreground text-[12px]">{v.validator_name}</span>
                    {v.message && <p className="text-muted-foreground text-[11.5px] mt-0.5 leading-relaxed">{v.message}</p>}
                  </div>
                </div>
              ))}
              {toolFailures.filter((f) => f.severity === 'critical').map((tf, i) => {
                const meta = getFailureMeta(tf.failure_type)
                return (
                  <div key={`tf-${i}`} className="flex items-start gap-2 text-[12.5px]">
                    <span className="mt-0.5 shrink-0 text-[11px]" style={{ color: '#ef4444' }}>⚠</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <CategoryPill category={meta.category} color={meta.categoryColor} />
                        <span className="font-medium text-foreground text-[12px]">{meta.label}</span>
                        <code className="text-[10px] font-mono text-muted-foreground">{tf.field_name}</code>
                      </div>
                      <p className="text-muted-foreground text-[11.5px] mt-0.5 leading-relaxed">{tf.evidence}</p>
                    </div>
                  </div>
                )
              })}
              {semanticSignals.map((sig, i) => (
                <div key={`sig-${i}`} className="flex items-start gap-2 text-[12.5px]">
                  <span className="mt-0.5 shrink-0 text-[11px]" style={{ color: '#a855f7' }}>⊗</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <code className="text-[10px] font-mono font-bold text-muted-foreground">{sig.sig_id}</code>
                      <span className="text-foreground text-[12px]">{sig.description}</span>
                    </div>
                    {sig.evidence && <p className="text-muted-foreground text-[11px] mt-0.5 font-mono">{sig.evidence}</p>}
                    {sig.field_path.length > 0 && (
                      <p className="text-muted-foreground/60 text-[10.5px] mt-0.5 font-mono">{sig.field_path.join('.')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Semantic Judge */}
        {sc && (
          <div
            className="rounded-lg px-3 py-2.5"
            style={{
              background: `color-mix(in srgb, ${sc.passed ? '#22c55e' : '#a855f7'} 5%, transparent)`,
              border: `1px solid color-mix(in srgb, ${sc.passed ? '#22c55e' : '#a855f7'} 14%, transparent)`,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Brain className="size-3" style={{ color: sc.passed ? '#22c55e' : '#a855f7' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Semantic Judge</span>
              <span className="text-[11px] font-mono font-semibold" style={{ color: sc.passed ? '#22c55e' : '#a855f7' }}>
                {sc.passed ? '✓ Coherent' : '✗ Incoherent'} {Math.round(sc.confidence * 100)}%
              </span>
            </div>
            {sc.reason && (
              <p className="text-[12px] text-muted-foreground leading-relaxed">{sc.reason}</p>
            )}
            {(sc.evidence_considered?.length ?? 0) > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-1">Evidence Considered</p>
                {sc.evidence_considered!.map((e, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground pl-2 border-l-2 border-border leading-relaxed">{e}</p>
                ))}
              </div>
            )}
            {(sc.overridden_signals?.length ?? 0) > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-[#f59e0b] uppercase tracking-wide mb-1">Overridden Signals</p>
                {sc.overridden_signals!.map((s, i) => (
                  <p key={i} className="text-[11px] text-[#f59e0b] pl-2 border-l-2 border-[#f59e0b]/30 leading-relaxed">{s}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Behavioral Anomalies */}
        {anomalies.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Behavioral Anomalies</p>
            <div className="flex flex-col gap-1.5">
              {anomalies.map((a, i) => {
                const sevColor = a.severity === 'critical' ? '#ef4444' : '#f59e0b'
                return (
                  <div
                    key={i}
                    className="rounded-lg px-3 py-2"
                    style={{
                      background: `color-mix(in srgb, ${sevColor} 4%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${sevColor} 12%, transparent)`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="size-1.5 rounded-full" style={{ background: sevColor }} />
                      <span className="text-[11px] font-semibold" style={{ color: sevColor }}>{a.severity}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">suspicion {(a.suspicion_score * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-[12.5px] text-foreground/90 leading-relaxed">{a.reason}</p>
                    {(a.expected_behavior || a.observed_behavior) && (
                      <div className="mt-1.5 grid grid-cols-2 gap-3 text-[11px]">
                        {a.expected_behavior && (
                          <div>
                            <span className="text-muted-foreground/60 uppercase text-[10px] tracking-wider">Expected</span>
                            <p className="text-muted-foreground mt-0.5">{a.expected_behavior}</p>
                          </div>
                        )}
                        {a.observed_behavior && (
                          <div>
                            <span className="text-muted-foreground/60 uppercase text-[10px] tracking-wider">Observed</span>
                            <p className="text-muted-foreground mt-0.5">{a.observed_behavior}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Fix Hint */}
        {fixHint && (
          <div className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <span className="text-[12px] mt-0.5 shrink-0" style={{ color: '#818cf8' }}>⚑</span>
            <p className="text-[12px] leading-relaxed" style={{ color: '#a5b4fc' }}>{fixHint}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Issue Row ──────────────────────────────────────────────────── */

function ToolFailureRow({ tf }: { tf: ToolFailure }) {
  const meta = getFailureMeta(tf.failure_type)
  const sevColor = tf.severity === 'critical' ? '#ef4444' : '#f59e0b'

  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2 rounded-lg"
      style={{
        background: `color-mix(in srgb, ${sevColor} 4%, transparent)`,
        border: `1px solid color-mix(in srgb, ${sevColor} 12%, transparent)`,
      }}
    >
      {/* severity dot */}
      <span className="mt-1.5 shrink-0 size-1.5 rounded-full" style={{ background: sevColor }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryPill category={meta.category} color={meta.categoryColor} />
          <span className="text-[13px] font-medium text-foreground">{meta.label}</span>
          <code className="text-[11px] font-mono text-muted-foreground">{tf.field_name}</code>
        </div>
        <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{tf.evidence}</p>
      </div>
    </div>
  )
}

function SemanticSignalRow({ sig }: { sig: SemanticSignal }) {
  const sevColor = sig.severity === 'critical' ? '#ef4444' : '#f59e0b'
  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2 rounded-lg"
      style={{
        background: 'color-mix(in srgb, #a855f7 4%, transparent)',
        border: '1px solid color-mix(in srgb, #a855f7 12%, transparent)',
      }}
    >
      <span className="mt-1.5 shrink-0 size-1.5 rounded-full" style={{ background: sevColor }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-[10px] font-mono font-bold text-muted-foreground">{sig.sig_id}</code>
          <span className="text-[13px] font-medium text-foreground">{sig.description}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground/70">{sig.category}</span>
          {sig.field_path.length > 0 && (
            <code className="text-[11px] font-mono text-muted-foreground">{sig.field_path.join('.')}</code>
          )}
        </div>
        {sig.evidence && (
          <p className="text-[11.5px] text-muted-foreground mt-0.5 font-mono">{sig.evidence}</p>
        )}
      </div>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────────────── */

function NodeDetail({ step, run, onDismiss }: { step: NodeEvent; run: RunRecord; onDismiss?: () => void }) {
  const badge = statusBadge(step.status)
  const hasTokens = (step.llm_usage?.total_tokens ?? 0) > 0
  const hasCost = (step.llm_usage?.total_cost_usd ?? 0) > 0
  const hasSemantic = !!step.semantic_check
  const hasValidators = step.validator_results.length > 0
  const hasException = !!step.exception

  // Collect all issues
  const toolFailures = step.inspection?.tool_failures ?? []
  const semanticSignals = step.inspection?.semantic_signals ?? []
  const missingFields = step.inspection?.missing_fields ?? []
  const emptyFields = step.inspection?.empty_fields ?? []
  const typeMismatches = step.inspection?.type_mismatches ?? []
  const degradedFields = step.inspection?.degraded_fields ?? []
  const degradedUpstream = step.inspection?.degraded_upstream_node ?? null
  const anomalySignals = step.anomaly_signals ?? []

  const totalIssues = toolFailures.length + semanticSignals.length + missingFields.length + typeMismatches.length
  const hasIssues = totalIssues > 0
  const hasDegradedInfo = degradedFields.length > 0 || degradedUpstream !== null
  const hasAnomalies = anomalySignals.length > 0

  const primaryFinding = derivePrimaryFinding(step)

  // Build inline metrics
  const metrics: { label: string; value: string }[] = [
    { label: 'Duration', value: formatDur(step.duration_ms) },
  ]
  if (hasTokens) metrics.push({ label: 'Tokens', value: step.llm_usage!.total_tokens.toLocaleString() })
  if (hasCost) metrics.push({ label: 'Cost', value: `$${step.llm_usage!.total_cost_usd!.toFixed(4)}` })
  if (step.attempt_index > 0) metrics.push({ label: 'Attempt', value: `#${step.attempt_index + 1}` })

  return (
    <div className="rounded-[10px] border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Info className="size-3.5 text-muted-foreground" />
          <span className="text-[13px] font-medium text-muted-foreground">Node Inspector</span>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        {/* Node name + status */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="font-mono text-[17px] font-bold text-foreground leading-tight">
            {step.node_name}
          </h3>
          <span
            className="shrink-0 mt-0.5"
            style={{
              fontSize: 11, fontWeight: 600, color: badge.color, background: badge.bg,
              padding: '2px 10px', borderRadius: 999,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: badge.color }} />
            {badge.label}
          </span>
        </div>

        {/* Subtitle: step + behavior + metrics */}
        <div className="flex items-center gap-0 text-[12.5px] text-muted-foreground flex-wrap">
          <span>Step {step.step_index + 1}</span>
          {step.behavior_type && (
            <>
              <span className="mx-1.5 text-border">·</span>
              <span className="font-mono text-[11.5px]" style={{ color: '#818cf8' }}>{step.behavior_type}</span>
            </>
          )}
          {metrics.map((m) => (
            <span key={m.label} className="contents">
              <span className="mx-1.5 text-border">·</span>
              <span>
                <span className="text-muted-foreground">{m.label} </span>
                <span className="font-mono tabular-nums text-foreground">{m.value}</span>
              </span>
            </span>
          ))}
        </div>

        {/* Primary Finding — headline */}
        {primaryFinding && (
          <div
            className="mt-4 px-3 py-2.5 rounded-lg flex items-start gap-2"
            style={{
              background: `color-mix(in srgb, ${primaryFinding.color} 5%, transparent)`,
              border: `1px solid color-mix(in srgb, ${primaryFinding.color} 15%, transparent)`,
            }}
          >
            <span className="mt-0.5 shrink-0 size-2 rounded-full" style={{ background: primaryFinding.color }} />
            <p className="text-[13px] leading-relaxed" style={{ color: primaryFinding.color }}>
              {primaryFinding.text}
            </p>
          </div>
        )}

        {/* Decision Explanation — synthesized "why" */}
        <DecisionExplanation step={step} run={run} />

        {/* Sections */}
        <div className="mt-5 flex flex-col gap-5">

          {/* ── Detected Issues ─────────────────────────────────── */}
          {hasIssues && (
            <div>
              <SectionHeader icon={AlertTriangle} label="Detected Issues" count={totalIssues} />
              <div className="flex flex-col gap-1.5">
                {/* Missing fields */}
                {missingFields.length > 0 && (
                  <div
                    className="flex items-start gap-2.5 px-3 py-2 rounded-lg"
                    style={{
                      background: 'color-mix(in srgb, #ef4444 4%, transparent)',
                      border: '1px solid color-mix(in srgb, #ef4444 12%, transparent)',
                    }}
                  >
                    <span className="mt-1.5 shrink-0 size-1.5 rounded-full" style={{ background: '#ef4444' }} />
                    <div className="min-w-0">
                      <span className="text-[13px] font-medium text-foreground">Missing Required Fields</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {missingFields.map((f) => (
                          <code
                            key={f}
                            className="rounded px-1.5 py-0.5 font-mono text-[11px]"
                            style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}
                          >
                            {f}
                          </code>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Type mismatches */}
                {typeMismatches.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 px-3 py-2 rounded-lg"
                    style={{
                      background: 'color-mix(in srgb, #f59e0b 4%, transparent)',
                      border: '1px solid color-mix(in srgb, #f59e0b 12%, transparent)',
                    }}
                  >
                    <span className="mt-1.5 shrink-0 size-1.5 rounded-full" style={{ background: '#f59e0b' }} />
                    <div className="min-w-0">
                      <span className="text-[13px] font-medium text-foreground">Type Mismatch</span>
                      <div className="text-[12px] font-mono mt-0.5">
                        <span className="text-blue-400">{m.field_name}</span>
                        <span className="text-muted-foreground"> expected </span>
                        <span className="text-green-400">{m.expected_type}</span>
                        <span className="text-muted-foreground"> got </span>
                        <span className="text-amber-400">{m.actual_type}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Tool failures */}
                {toolFailures.map((tf, i) => (
                  <ToolFailureRow key={`tf-${i}`} tf={tf} />
                ))}

                {/* Semantic signals */}
                {semanticSignals.map((sig, i) => (
                  <SemanticSignalRow key={`sig-${i}`} sig={sig} />
                ))}
              </div>

              {/* Empty fields — subtle */}
              {emptyFields.length > 0 && (
                <div className="mt-2 text-[12px] text-muted-foreground/70">
                  <span>Empty optional: </span>
                  <span className="font-mono">{emptyFields.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Degraded Input ──────────────────────────────────── */}
          {hasDegradedInfo && (
            <div>
              <SectionHeader icon={ArrowRight} label="Degraded Input" color="#f59e0b" />
              <div
                className="px-3 py-2.5 rounded-lg text-[13px]"
                style={{
                  background: 'color-mix(in srgb, #f59e0b 4%, transparent)',
                  border: '1px solid color-mix(in srgb, #f59e0b 12%, transparent)',
                }}
              >
                {degradedUpstream && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-muted-foreground">Upstream culprit:</span>
                    <code
                      className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}
                    >
                      {degradedUpstream}
                    </code>
                  </div>
                )}
                {degradedFields.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground">Affected fields:</span>
                    {degradedFields.map((f) => (
                      <code
                        key={f}
                        className="font-mono text-[11px] px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(245,158,11,0.08)', color: '#fbbf24' }}
                      >
                        {f}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Semantic Check ──────────────────────────────────── */}
          {hasSemantic && (
            <div>
              <SectionHeader icon={Brain} label="Semantic Check" />
              <div className="flex items-center gap-2 mb-1">
                {step.semantic_check!.passed ? (
                  <Check className="size-3.5 text-[#22c55e]" />
                ) : (
                  <XIcon className="size-3.5 text-[#ef4444]" />
                )}
                <span className="text-[13px] font-semibold text-foreground">
                  {step.semantic_check!.passed ? 'Coherent' : 'Incoherent'}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {Math.round(step.semantic_check!.confidence * 100)}%
                </span>
              </div>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                {step.semantic_check!.reason}
              </p>
              {(step.semantic_check!.evidence_considered?.length ?? 0) > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Evidence Considered</p>
                  {step.semantic_check!.evidence_considered!.map((e, i) => (
                    <p key={i} className="text-[12px] text-muted-foreground pl-2 border-l-2 border-border">{e}</p>
                  ))}
                </div>
              )}
              {(step.semantic_check!.overridden_signals?.length ?? 0) > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[11px] font-medium text-[#f59e0b] uppercase tracking-wide">Overridden Signals</p>
                  {step.semantic_check!.overridden_signals!.map((s, i) => (
                    <p key={i} className="text-[12px] text-[#f59e0b] pl-2 border-l-2 border-[#f59e0b]/30">{s}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Anomaly Signals ─────────────────────────────────── */}
          {hasAnomalies && (
            <div>
              <SectionHeader icon={Activity} label="Anomaly Signals" count={anomalySignals.length} />
              <div className="flex flex-col gap-1.5">
                {anomalySignals.map((a, i) => {
                  const sevColor = a.severity === 'critical' ? '#ef4444' : '#f59e0b'
                  return (
                    <div
                      key={i}
                      className="px-3 py-2.5 rounded-lg"
                      style={{
                        background: `color-mix(in srgb, ${sevColor} 4%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${sevColor} 12%, transparent)`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="size-1.5 rounded-full" style={{ background: sevColor }} />
                        <span className="text-[12px] font-semibold" style={{ color: sevColor }}>{a.severity}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          suspicion {(a.suspicion_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-[13px] text-foreground/90 leading-relaxed">{a.reason}</p>
                      {(a.expected_behavior || a.observed_behavior) && (
                        <div className="mt-1.5 grid grid-cols-2 gap-3 text-[11.5px]">
                          {a.expected_behavior && (
                            <div>
                              <span className="text-muted-foreground/60 uppercase text-[10px] tracking-wider">Expected</span>
                              <p className="text-muted-foreground mt-0.5">{a.expected_behavior}</p>
                            </div>
                          )}
                          {a.observed_behavior && (
                            <div>
                              <span className="text-muted-foreground/60 uppercase text-[10px] tracking-wider">Observed</span>
                              <p className="text-muted-foreground mt-0.5">{a.observed_behavior}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Validators ──────────────────────────────────────── */}
          {hasValidators && (
            <div>
              <SectionHeader icon={ShieldCheck} label="Validators" />
              <div className="flex flex-col gap-1.5">
                {step.validator_results.map((v, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {v.is_valid ? (
                      <Check className="size-3 mt-0.5 text-[#22c55e] shrink-0" />
                    ) : (
                      <XIcon className="size-3 mt-0.5 text-[#ef4444] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="font-mono text-[12px] font-medium text-foreground">{v.validator_name}</span>
                      {v.message && (
                        <span className="text-[11.5px] text-muted-foreground ml-1.5">{v.message}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Exception ───────────────────────────────────────── */}
          {hasException && (
            <div>
              <SectionHeader icon={Bug} label="Exception" color="#ef4444" />
              <div
                className="rounded-lg overflow-hidden"
                style={{
                  background: 'color-mix(in srgb, var(--failure) 3%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--failure) 25%, transparent)',
                }}
              >
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40">
                  <span className="size-2 rounded-full" style={{ background: '#ef4444' }} />
                  <span className="size-2 rounded-full" style={{ background: '#f59e0b' }} />
                  <span className="size-2 rounded-full" style={{ background: '#22c55e' }} />
                  <span className="font-mono text-[10px] text-muted-foreground ml-0.5">traceback</span>
                </div>
                <div className="px-3 py-2.5 overflow-x-auto">
                  <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all" style={{ color: '#ef9a9a' }}>
                    {step.exception}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* ── Input / Output ──────────────────────────────────── */}
          {(step.input_state || step.output_dict) && (
            <div className="border-t border-border pt-4 flex flex-col gap-1">
              <CollapsibleJson label="Input State" data={step.input_state} />
              <CollapsibleJson label="Output" data={step.output_dict} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function StepInspector({
  run,
  selectedNodeName,
  onDismiss,
}: {
  run: RunRecord
  selectedNodeName?: string | null
  onDismiss?: () => void
}) {
  const steps = run.steps ?? []

  if (selectedNodeName) {
    const step = steps.find((s) => s.node_name === selectedNodeName)
    if (step) return <NodeDetail step={step} run={run} onDismiss={onDismiss} />
  }

  const failedStep = steps.find((s) => s.status !== 'pass')
  if (!failedStep) return null

  return <NodeDetail step={failedStep} run={run} />
}
