'use client'

import type { RunStatus, StepStatus, Severity } from '@/lib/types'

const RUN_STATUS_MAP: Record<RunStatus, { label: string; color: string }> = {
  clean: { label: 'clean', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  silent_failure: { label: 'silent_failure', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  crashed: { label: 'crashed', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  semantic_fail: { label: 'semantic_fail', color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  interrupted: { label: 'interrupted', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
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
  const s = RUN_STATUS_MAP[status] ?? { label: status, color: 'text-[#6b7280]' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-mono ${s.color}`}>
      {s.label}
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
