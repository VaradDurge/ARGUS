'use client'

import type { RunStatus, StepStatus, Severity } from '@/lib/types'

const RUN_STATUS_MAP: Record<RunStatus, { label: string; dot: string; color: string }> = {
  clean:          { label: 'clean',          dot: '\u25CF', color: '#3d9e7d' },
  silent_failure: { label: 'silent failure', dot: '\u25CF', color: '#d49a2e' },
  crashed:        { label: 'crashed',        dot: '\u25CF', color: '#d65c5c' },
  semantic_fail:  { label: 'semantic fail',  dot: '\u25CF', color: '#9a6dc6' },
  interrupted:    { label: 'interrupted',    dot: '\u23F8', color: '#d49a2e' },
}

const STEP_STATUS_MAP: Record<StepStatus, { icon: string; label: string; color: string }> = {
  pass:           { icon: '\u2713', label: 'pass',           color: '#3d9e7d' },
  degraded_input: { icon: '\u2B07', label: 'degraded input', color: '#d49a2e' },
  fail:           { icon: '\u26A0', label: 'fail',           color: '#d49a2e' },
  crashed:        { icon: '\u2717', label: 'crashed',        color: '#d65c5c' },
  semantic_fail:  { icon: '\u2298', label: 'semantic fail',  color: '#9a6dc6' },
  interrupted:    { icon: '\u23F8', label: 'interrupted',    color: '#d49a2e' },
}

const SEVERITY_MAP: Record<Severity, { color: string; bg: string }> = {
  critical: { color: '#d65c5c', bg: 'rgba(214,92,92,0.08)' },
  warning:  { color: '#d49a2e', bg: 'rgba(212,154,46,0.08)' },
  info:     { color: '#7c7fc7', bg: 'rgba(124,127,199,0.08)' },
  ok:       { color: '#3d9e7d', bg: 'rgba(61,158,125,0.08)' },
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const s = RUN_STATUS_MAP[status] ?? { label: status, dot: '\u25CF', color: '#5d6370' }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
      <span style={{ color: s.color, fontSize: '8px' }}>{s.dot}</span>
      <span style={{ color: s.color }}>{s.label}</span>
    </span>
  )
}

export function StepStatusBadge({ status }: { status: StepStatus }) {
  const s = STEP_STATUS_MAP[status] ?? { icon: '?', label: status, color: '#5d6370' }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: s.color }}>
      <span>{s.icon}</span>
      <span>{s.label}</span>
    </span>
  )
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_MAP[severity] ?? { color: '#5d6370', bg: 'rgba(156,163,175,0.08)' }
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
