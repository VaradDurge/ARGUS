import type { RunSummary } from '@/lib/types'
import type { EvalState, Constraint } from './EvaluationBuilder'

function resolveValue(run: RunSummary, field: string): unknown {
  switch (field) {
    case 'overall_status': return run.overall_status
    case 'duration_ms': return run.duration_ms
    case 'step_count': return run.step_count
    case 'first_failure_step': return run.first_failure_step
    default: return null
  }
}

function evalConstraint(run: RunSummary, c: Constraint): boolean {
  const actual = resolveValue(run, c.field)
  if (actual === null || actual === undefined) return false
  const trimmedValue = c.value.trim()
  const numActual = Number(actual)
  const numExpected = Number(trimmedValue)
  const bothNumeric = !isNaN(numActual) && !isNaN(numExpected) && trimmedValue !== ''
  switch (c.condition) {
    case '==': return bothNumeric ? numActual === numExpected : String(actual).trim() === trimmedValue
    case '!=': return bothNumeric ? numActual !== numExpected : String(actual).trim() !== trimmedValue
    case '<=': return numActual <= numExpected
    case '>=': return numActual >= numExpected
    case '<': return numActual < numExpected
    case '>': return numActual > numExpected
    case 'contains': return String(actual).toLowerCase().includes(trimmedValue.toLowerCase())
    default: return false
  }
}

interface Props {
  run: RunSummary
  evalState: EvalState
}

export default function EvalBadge({ run, evalState }: Props) {
  const active = evalState.constraints.filter((c) => c.value.trim())
  if (active.length === 0) return null

  const passed = active.filter((c) => evalConstraint(run, c)).length
  const total = active.length
  const allPass = passed === total
  const allFail = passed === 0

  const color = allPass ? '#22c55e' : allFail ? '#ef4444' : '#f59e0b'
  const bg = allPass
    ? 'rgba(34,197,94,0.1)'
    : allFail
    ? 'rgba(239,68,68,0.1)'
    : 'rgba(245,158,11,0.1)'
  const border = allPass
    ? 'rgba(34,197,94,0.22)'
    : allFail
    ? 'rgba(239,68,68,0.22)'
    : 'rgba(245,158,11,0.22)'
  const label = allPass ? 'pass' : allFail ? 'fail' : `${passed}/${total}`
  const icon = allPass ? '✓' : '✗'

  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ color, background: bg, border: `1px solid ${border}` }}
    >
      {icon} {label}
    </span>
  )
}
