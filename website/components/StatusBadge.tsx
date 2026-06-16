'use client'

import { cn } from '@/lib/utils'
import type { RunStatus, StepStatus, Severity } from '@/lib/types'

/* ── Run Status Badge ──────────────────────────────────────────── */

const RUN_STATUS_CONFIG: Record<
  RunStatus,
  { label: string; color: string }
> = {
  clean:          { label: 'Clean',          color: '#22c55e' },
  silent_failure: { label: 'Silent Failure', color: '#eab308' },
  crashed:        { label: 'Crashed',        color: '#ef4444' },
  semantic_fail:  { label: 'Semantic Fail',  color: '#a855f7' },
  interrupted:    { label: 'Interrupted',    color: '#8b8fa0' },
}

export function RunStatusBadge({
  status,
  size = 'default',
  className,
}: {
  status: RunStatus
  size?: 'default' | 'sm'
  className?: string
}) {
  const c = RUN_STATUS_CONFIG[status] ?? { label: status, color: '#8b8fa0' }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[4px] border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
      style={{
        color: c.color,
        backgroundColor: `color-mix(in srgb, ${c.color} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${c.color} 25%, transparent)`,
      }}
    >
      <span className="relative flex h-2 w-2">
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: c.color }}
        />
      </span>
      {c.label}
    </span>
  )
}

/* ── Step Status Badge ─────────────────────────────────────────── */

const STEP_STATUS_CONFIG: Record<StepStatus, { label: string; color: string }> = {
  pass:           { label: 'pass',           color: '#22c55e' },
  degraded_input: { label: 'degraded input', color: '#eab308' },
  fail:           { label: 'fail',           color: '#eab308' },
  crashed:        { label: 'crashed',        color: '#ef4444' },
  semantic_fail:  { label: 'semantic fail',  color: '#a855f7' },
  interrupted:    { label: 'interrupted',    color: '#8b8fa0' },
}

export function StepStatusBadge({ status, className }: { status: StepStatus; className?: string }) {
  const c = STEP_STATUS_CONFIG[status] ?? { label: status, color: '#8b8fa0' }

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium', className)}
      style={{ color: c.color }}
    >
      <span className="inline-flex h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
      <span>{c.label}</span>
    </span>
  )
}

/* ── Severity Badge ────────────────────────────────────────────── */

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#ef4444',
  warning:  '#eab308',
  info:     '#3b82f6',
  ok:       '#22c55e',
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const color = SEVERITY_COLOR[severity] ?? '#8b8fa0'

  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded-[4px] border text-[11px] font-semibold', className)}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {severity}
    </span>
  )
}
