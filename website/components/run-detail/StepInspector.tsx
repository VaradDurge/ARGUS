'use client'

import { Info } from 'lucide-react'
import type { RunRecord, NodeEvent } from '@/lib/types'
import { formatDur } from '@/lib/run-utils'

function statusBadge(status: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pass: { label: 'Passed', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    crashed: { label: 'Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    fail: { label: 'Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    semantic_fail: { label: 'Failed', color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
    interrupted: { label: 'Interrupted', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  }
  return map[status] ?? { label: status, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' }
}

export default function StepInspector({ run }: { run: RunRecord }) {
  const steps = run.steps ?? []
  const failedStep = steps.find((s) => s.status !== 'pass')

  if (!failedStep) return null

  const badge = statusBadge(failedStep.status)
  const toolName = failedStep.node_name.includes('tool') || failedStep.node_name.includes('Tool')
    ? failedStep.node_name
    : `Step: ${failedStep.node_name}`

  const description = failedStep.inspection?.message
    ?? failedStep.exception?.split('\n').find((l) => l.trim())
    ?? null

  const traceLines: string[] = []
  if (failedStep.exception) {
    const lines = failedStep.exception.split('\n').filter((l) => l.trim())
    traceLines.push(...lines.slice(0, 6))
  } else if (failedStep.inspection?.missing_fields?.length) {
    traceLines.push(`Missing fields: ${failedStep.inspection.missing_fields.join(', ')}`)
  } else if (description) {
    traceLines.push(description)
  }

  return (
    <div className="rounded-[10px] border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Info className="size-3.5 text-muted-foreground" />
        <span className="text-base font-semibold text-foreground">
          Step Inspector
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[15px] font-semibold text-foreground">{toolName}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: badge.color,
                background: badge.bg,
                padding: '2px 10px',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: badge.color }} />
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>DURATION</span>
              <div className="tnum font-mono text-sm text-foreground">{formatDur(failedStep.duration_ms)}</div>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>TOKENS</span>
              <div className="tnum font-mono text-sm text-foreground">
                {failedStep.llm_usage?.total_tokens ? `${failedStep.llm_usage.total_tokens}` : '—'}
              </div>
            </div>
          </div>
        </div>

        {description && (
          <div className="text-xs text-muted-foreground mb-2.5">
            {description.length > 50 ? description.slice(0, 50) : description}
          </div>
        )}

        {traceLines.length > 0 && (
          <div
            className="rounded-[10px] mt-2"
            style={{
              background: 'color-mix(in srgb, var(--failure) 3%, transparent)',
              border: '1px solid color-mix(in srgb, var(--failure) 35%, transparent)',
            }}
          >
            <div
              className="flex items-center gap-2 px-3.5 py-2.5 bg-code-header border-b border-border/60"
              style={{ borderTopLeftRadius: 10, borderTopRightRadius: 10 }}
            >
              <span className="size-2.5 rounded-full" style={{ background: '#ef4444' }} />
              <span className="size-2.5 rounded-full" style={{ background: '#f59e0b' }} />
              <span className="size-2.5 rounded-full" style={{ background: '#22c55e' }} />
              <span className="font-mono text-[11px] text-muted-foreground ml-1">stderr — exit 1</span>
            </div>
            <div className="px-3.5 py-2.5">
              <div className="font-mono text-[12.5px] leading-relaxed" style={{ color: '#ef9a9a' }}>
                {traceLines.map((line, i) => (
                  <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
