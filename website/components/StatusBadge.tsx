'use client'

import type { RunStatus, StepStatus, Severity } from '@/lib/types'

// Matches CLI _STATUS_DOT + _STATUS_STYLE exactly
const RUN_STATUS_MAP: Record<RunStatus, { label: string; dot: string; color: string }> = {
  clean:          { label: 'clean',          dot: '●', color: '#22c55e' },
  silent_failure: { label: 'silent_failure', dot: '●', color: '#f59e0b' },
  crashed:        { label: 'crashed',        dot: '●', color: '#ef4444' },
  semantic_fail:  { label: 'semantic_fail',  dot: '●', color: '#d946ef' },
  interrupted:    { label: 'interrupted',    dot: '⏸', color: '#f59e0b' },
}

const STEP_STATUS_MAP: Record<StepStatus, { icon: string; label: string; color: string }> = {
  pass: { icon: '✓', label: 'pass', color: 'text-green-400' },
  fail: { icon: '⚠', label: 'fail', color: 'text-amber-400' },
  crashed: { icon: '✗', label: 'crashed', color: 'text-red-400' },
  semantic_fail: { icon: '⊗', label: 'semantic_fail', color: 'text-purple-400' },
  interrupted: { icon: '⏸', label: 'interrupted', color: 'text-blue-400' },
}

const SEVERITY_MAP: Record<Severity, { label: string; color: string }> = {
  critical: { label: 'critical', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  warning: { label: 'warning', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  info: { label: 'info', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  ok: { label: 'ok', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const s = RUN_STATUS_MAP[status] ?? { label: status, dot: '●', color: '#71717a' }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold" style={{ color: s.color }}>
      <span>{s.dot}</span>
      <span>{s.label}</span>
    </span>
  )
}

export function StepStatusBadge({ status }: { status: StepStatus }) {
  const s = STEP_STATUS_MAP[status] ?? { icon: '?', label: status, color: 'text-[#6b7280]' }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono ${s.color}`}>
      <span>{s.icon}</span>
      <span>{s.label}</span>
    </span>
  )
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_MAP[severity] ?? { label: severity, color: 'text-[#6b7280]' }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border font-mono ${s.color}`}>
      {s.label}
    </span>
  )
}
