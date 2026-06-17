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
} from 'lucide-react'
import type { RunRecord, NodeEvent } from '@/lib/types'
import { formatDur } from '@/lib/run-utils'
import JsonViewer from '@/components/JsonViewer'

function statusBadge(status: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pass: { label: 'Passed', color: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
    crashed: { label: 'Crashed', color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
    fail: { label: 'Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
    semantic_fail: { label: 'Semantic Fail', color: '#a855f7', bg: 'rgba(168,85,247,0.10)' },
    interrupted: { label: 'Interrupted', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
    degraded_input: { label: 'Degraded', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
  }
  return map[status] ?? { label: status, color: '#6b7280', bg: 'rgba(107,114,128,0.08)' }
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

function NodeDetail({ step, onDismiss }: { step: NodeEvent; onDismiss?: () => void }) {
  const badge = statusBadge(step.status)
  const hasTokens = (step.llm_usage?.total_tokens ?? 0) > 0
  const hasCost = (step.llm_usage?.total_cost_usd ?? 0) > 0
  const hasSemantic = !!step.semantic_check
  const hasValidators = step.validator_results.length > 0
  const hasException = !!step.exception
  // Filter out "Unannotated successors" noise — shown as a banner instead
  const rawMessage = step.inspection?.message ?? ''
  const filteredMessage = rawMessage
    .split('. ')
    .filter((s) => !s.startsWith('Unannotated successors'))
    .join('. ')
    .trim()
  const hasInspection = !!filteredMessage
  const hasMissing = (step.inspection?.missing_fields?.length ?? 0) > 0

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
        {/* Node name row */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="font-mono text-[17px] font-bold text-foreground leading-tight">
            {step.node_name}
          </h3>
          <span
            className="shrink-0 mt-0.5"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: badge.color,
              background: badge.bg,
              padding: '2px 10px',
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: badge.color }} />
            {badge.label}
          </span>
        </div>

        {/* Subtitle: step + behavior + metrics inline */}
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

        {/* Sections — clean, flat, Linear-style */}
        <div className="mt-5 flex flex-col gap-5">
          {/* Inspection */}
          {hasInspection && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="size-3 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Inspection</span>
              </div>
              <p className="text-[13px] text-foreground/90 leading-relaxed">
                {filteredMessage}
              </p>
              {hasMissing && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {step.inspection!.missing_fields.map((f) => (
                    <code
                      key={f}
                      className="rounded px-1.5 py-0.5 font-mono text-[11px]"
                      style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}
                    >
                      {f}
                    </code>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Semantic Check */}
          {hasSemantic && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Brain className="size-3 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Semantic Check</span>
              </div>
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
            </div>
          )}

          {/* Validators */}
          {hasValidators && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <ShieldCheck className="size-3 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Validators</span>
              </div>
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

          {/* Exception */}
          {hasException && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Bug className="size-3 text-[#ef4444]" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#ef4444]">Exception</span>
              </div>
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

          {/* Input / Output */}
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
    if (step) return <NodeDetail step={step} onDismiss={onDismiss} />
  }

  const failedStep = steps.find((s) => s.status !== 'pass')
  if (!failedStep) return null

  return <NodeDetail step={failedStep} />
}
