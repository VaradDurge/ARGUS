'use client'

import type { RunStatus, StepStatus, Severity } from '@/lib/types'

const RUN_STATUS_MAP: Record<RunStatus, { label: string; dot: string; color: string }> = {
  clean:          { label: 'clean',          dot: '\u25CF', color: '#10b981' },
  silent_failure: { label: 'silent failure', dot: '\u25CF', color: '#f59e0b' },
  crashed:        { label: 'crashed',        dot: '\u25CF', color: '#ef4444' },
  semantic_fail:  { label: 'semantic fail',  dot: '\u25CF', color: '#a855f7' },
  interrupted:    { label: 'interrupted',    dot: '\u23F8', color: '#f59e0b' },
}

const STEP_STATUS_MAP: Record<StepStatus, { icon: string; label: string; color: string }> = {
  pass:           { icon: '\u2713', label: 'pass',           color: '#10b981' },
  degraded_input: { icon: '\u2B07', label: 'degraded input', color: '#f59e0b' },
  fail:           { icon: '\u26A0', label: 'fail',           color: '#f59e0b' },
  crashed:        { icon: '\u2717', label: 'crashed',        color: '#ef4444' },
  semantic_fail:  { icon: '\u2298', label: 'semantic fail',  color: '#a855f7' },
  interrupted:    { icon: '\u23F8', label: 'interrupted',    color: '#f59e0b' },
}

const SEVERITY_MAP: Record<Severity, { color: string; bg: string }> = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  warning:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  info:     { color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  ok:       { color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const s = RUN_STATUS_MAP[status] ?? { label: status, dot: '\u25CF', color: '#9ca3af' }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
      <span style={{ color: s.color, fontSize: '8px' }}>{s.dot}</span>
      <span style={{ color: s.color }}>{s.label}</span>
    </span>
  )
}

export function StepStatusBadge({ status }: { status: StepStatus }) {
  const s = STEP_STATUS_MAP[status] ?? { icon: '?', label: status, color: '#9ca3af' }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: s.color }}>
      <span>{s.icon}</span>
      <span>{s.label}</span>
    </span>
  )
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_MAP[severity] ?? { color: '#9ca3af', bg: 'rgba(156,163,175,0.08)' }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold"
      style={{
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.color}20`,
      }}
    >
      {severity}
    </span>
  )
}
