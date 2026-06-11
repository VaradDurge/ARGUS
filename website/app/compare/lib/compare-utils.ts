import type { RunRecord, NodeEvent } from '@/lib/types'

// ── Status maps ───────────────────────────────────────────────────────────

export const STEP_ICON: Record<string, { icon: string; color: string }> = {
  pass:           { icon: '\u2713', color: '#3d9e7d' },
  degraded_input: { icon: '\u2B07', color: '#d49a2e' },
  fail:           { icon: '\u26A0', color: '#d49a2e' },
  crashed:        { icon: '\u2717', color: '#d65c5c' },
  semantic_fail:  { icon: '\u2298', color: '#9a6dc6' },
  interrupted:    { icon: '\u23F8', color: '#d49a2e' },
}

export const STEP_LABEL: Record<string, { label: string; color: string }> = {
  pass:           { label: 'Passed',         color: '#3d9e7d' },
  degraded_input: { label: 'Degraded',       color: '#d49a2e' },
  fail:           { label: 'Failed',         color: '#d49a2e' },
  crashed:        { label: 'Crashed',        color: '#d65c5c' },
  semantic_fail:  { label: 'Semantic Fail',  color: '#9a6dc6' },
  interrupted:    { label: 'Interrupted',    color: '#d49a2e' },
}

export const STATUS_DOT_COLOR: Record<string, string> = {
  clean:          '#3d9e7d',
  silent_failure: '#d49a2e',
  crashed:        '#d65c5c',
  semantic_fail:  '#9a6dc6',
  interrupted:    '#d49a2e',
}

export const STATUS_LABEL: Record<string, string> = {
  clean:          'clean',
  silent_failure: 'silent failure',
  crashed:        'crashed',
  semantic_fail:  'semantic fail',
  interrupted:    'interrupted',
}

// ── Replay detection ──────────────────────────────────────────────────────

export function isReplayOf(a: RunRecord, b: RunRecord): boolean {
  return b.parent_run_id === a.run_id
}

export function runBLabel(a: RunRecord, b: RunRecord): string {
  return isReplayOf(a, b) ? 'Replay' : 'Run B'
}

// ── Structural analysis ───────────────────────────────────────────────────

export interface StructuralAnalysis {
  overlapRatio: number
  isStructurallyDifferent: boolean
  sharedNodes: string[]
  onlyInA: string[]
  onlyInB: string[]
}

export function computeStructuralAnalysis(a: RunRecord, b: RunRecord): StructuralAnalysis {
  const setA = new Set((a.steps ?? []).map((s) => s.node_name))
  const setB = new Set((b.steps ?? []).map((s) => s.node_name))
  const arrA = Array.from(setA)
  const arrB = Array.from(setB)
  const shared = arrA.filter((n) => setB.has(n))
  const onlyInA = arrA.filter((n) => !setB.has(n))
  const onlyInB = arrB.filter((n) => !setA.has(n))
  const union = new Set(arrA.concat(arrB)).size
  const overlapRatio = union > 0 ? shared.length / union : 1
  return {
    overlapRatio,
    isStructurallyDifferent: overlapRatio < 0.5,
    sharedNodes: shared,
    onlyInA,
    onlyInB,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function getEventColor(event: NodeEvent): string {
  return STEP_ICON[event.status]?.color ?? '#5d6370'
}

export function getEventIcon(event: NodeEvent): string {
  return STEP_ICON[event.status]?.icon ?? '\u25CF'
}

// ── Diff computation ───────────────────────────────────────────────────────

export interface FieldDiff {
  field: string
  type: 'added' | 'removed' | 'changed'
}

export interface InspectionDiff {
  text: string
  icon: string
  iconColor: string
}

export interface ValidatorDiff {
  name: string
  change: string
  icon: string
  iconColor: string
}

export interface NodeDiff {
  name: string
  before: NodeEvent | undefined
  after: NodeEvent | undefined
  statusChanged: boolean
  isFixed: boolean
  isRegression: boolean
  isNew: boolean
  isFrozen: boolean
  frozenNote: string
  fieldDiffs: FieldDiff[]
  inspectionDiffs: InspectionDiff[]
  validatorDiffs: ValidatorDiff[]
  durDiff: string
}

export function buildNodeMap(run: RunRecord): Map<string, NodeEvent> {
  const map = new Map<string, NodeEvent>()
  for (const e of run.steps ?? []) map.set(e.node_name, e)
  return map
}

export function orderedNodes(a: RunRecord, b: RunRecord): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const e of a.steps ?? []) {
    if (!seen.has(e.node_name)) { seen.add(e.node_name); result.push(e.node_name) }
  }
  for (const e of b.steps ?? []) {
    if (!seen.has(e.node_name)) { seen.add(e.node_name); result.push(e.node_name) }
  }
  return result
}

export function diffOutput(before: Record<string, unknown> | null, after: Record<string, unknown> | null): FieldDiff[] {
  if (!before && !after) return []
  if (!before) return [{ field: '(all)', type: 'added' }]
  if (!after) return [{ field: '(all)', type: 'removed' }]
  const diffs: FieldDiff[] = []
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])
  allKeys.forEach((key) => {
    if (!(key in before)) diffs.push({ field: key, type: 'added' })
    else if (!(key in after)) diffs.push({ field: key, type: 'removed' })
    else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) diffs.push({ field: key, type: 'changed' })
  })
  return diffs
}

export function diffInspection(before: NodeEvent | undefined, after: NodeEvent | undefined): InspectionDiff[] {
  const bInsp = before?.inspection
  const aInsp = after?.inspection
  if (!bInsp && !aInsp) return []
  const diffs: InspectionDiff[] = []

  const bMissing = new Set(bInsp?.missing_fields ?? [])
  const aMissing = new Set(aInsp?.missing_fields ?? [])

  bMissing.forEach((f) => {
    if (!aMissing.has(f)) diffs.push({ text: `Missing required field "${f}" fixed`, icon: '\u2713', iconColor: '#3d9e7d' })
  })
  aMissing.forEach((f) => {
    if (!bMissing.has(f)) diffs.push({ text: `"${f}" now missing`, icon: '\u2717', iconColor: '#d65c5c' })
  })

  const bSev = bInsp?.severity ?? 'ok'
  const aSev = aInsp?.severity ?? 'ok'
  const SEV_RANK: Record<string, number> = { ok: 0, info: 1, warning: 2, critical: 3 }
  if (bSev !== aSev) {
    const improved = (SEV_RANK[aSev] ?? 0) < (SEV_RANK[bSev] ?? 0)
    diffs.push({
      text: `Severity ${bSev} \u2192 ${aSev}`,
      icon: improved ? '\u2713' : '~',
      iconColor: improved ? '#3d9e7d' : '#d49a2e',
    })
  }

  return diffs
}

export function diffValidators(before: NodeEvent | undefined, after: NodeEvent | undefined): ValidatorDiff[] {
  const bMap = new Map((before?.validator_results ?? []).map((v) => [v.validator_name, v.is_valid]))
  const aMap = new Map((after?.validator_results ?? []).map((v) => [v.validator_name, v.is_valid]))
  const allNames = new Set([...Array.from(bMap.keys()), ...Array.from(aMap.keys())])
  const diffs: ValidatorDiff[] = []

  allNames.forEach((name) => {
    const b = bMap.get(name)
    const a = aMap.get(name)
    if (b === undefined && a !== undefined) {
      diffs.push({ name, change: 'new', icon: a ? '\u2713' : '\u2298', iconColor: a ? '#3d9e7d' : '#9a6dc6' })
    } else if (b !== undefined && a === undefined) {
      diffs.push({ name, change: 'removed', icon: '\u2212', iconColor: '#5d6370' })
    } else if (b !== a) {
      if (!b && a) diffs.push({ name, change: 'fail \u2192 pass', icon: '\u2713', iconColor: '#3d9e7d' })
      else diffs.push({ name, change: 'pass \u2192 fail', icon: '\u2298', iconColor: '#9a6dc6' })
    }
  })

  return diffs
}

export function formatDurDiff(bMs: number | undefined, aMs: number | undefined): string {
  if (bMs === undefined || aMs === undefined) return ''
  const delta = aMs - bMs
  if (Math.abs(delta) < 100) return ''
  const sign = delta >= 0 ? '+' : ''
  return `${sign}${Math.round(delta)} ms`
}

export function computeDiffs(runA: RunRecord, runB: RunRecord): { nodes: NodeDiff[]; stats: Record<string, number> } {
  const mapA = buildNodeMap(runA)
  const mapB = buildNodeMap(runB)

  // When B is a replay of A, inherit A's pre-replay steps into B
  // so the comparison shows the full pipeline, not just re-run nodes
  if (isReplayOf(runA, runB) && runB.replay_from_step) {
    for (const step of runA.steps ?? []) {
      if (!mapB.has(step.node_name)) {
        mapB.set(step.node_name, step)
      }
    }
  }

  const names = orderedNodes(runA, runB)
  const stats = { changed: 0, fixed: 0, regressed: 0, new_: 0, frozen: 0 }

  const nodes = names.map((name) => {
    const before = mapA.get(name)
    const after = mapB.get(name)
    const statusChanged = before && after ? before.status !== after.status : false
    const fieldDiffs = before && after ? diffOutput(before.output_dict, after.output_dict) : []
    const inspectionDiffs = diffInspection(before, after)
    const validatorDiffs = diffValidators(before, after)
    const durDiff = formatDurDiff(before?.duration_ms, after?.duration_ms)
    const hasChanges = statusChanged || fieldDiffs.length > 0 || inspectionDiffs.length > 0 || validatorDiffs.length > 0

    const bBad = before && ['crashed', 'fail', 'semantic_fail'].includes(before.status)
    const aBad = after && ['crashed', 'fail', 'semantic_fail'].includes(after.status)
    const isFixed = !!(statusChanged && bBad && after?.status === 'pass')
    const isRegression = !!(statusChanged && before?.status === 'pass' && aBad)
    const isNew = !before && !!after
    const isFrozen = !!before && !after

    if (hasChanges) stats.changed++
    if (isFixed) stats.fixed++
    if (isRegression) stats.regressed++
    if (isNew) stats.new_++
    if (isFrozen) stats.frozen++

    return {
      name,
      before,
      after,
      statusChanged,
      isFixed,
      isRegression,
      isNew,
      isFrozen,
      frozenNote: isFrozen ? (runB.replay_from_step ? 'not re-run' : 'only in A') : '',
      fieldDiffs,
      inspectionDiffs,
      validatorDiffs,
      durDiff,
    }
  })

  return { nodes, stats }
}

// ── Eval metrics ───────────────────────────────────────────────────────────

const FAIL_WEIGHT: Record<string, number> = { crashed: 3, semantic_fail: 2, fail: 1 }

export interface RunMetrics {
  failureCount: number
  failureWeight: number
  firstFailIdx: number
  successRate: number
}

export function runMetrics(run: RunRecord): RunMetrics {
  const steps = run.steps ?? []
  const total = steps.length
  if (total === 0) return { failureCount: 0, failureWeight: 0, firstFailIdx: Infinity, successRate: 100 }

  let failureCount = 0
  let failureWeight = 0
  let firstFailIdx = Infinity
  let passCount = 0

  steps.forEach((s, i) => {
    if (s.status === 'pass') {
      passCount++
    } else {
      failureCount++
      failureWeight += FAIL_WEIGHT[s.status] ?? 1
      if (i < firstFailIdx) firstFailIdx = i
    }
  })

  return { failureCount, failureWeight, firstFailIdx, successRate: Math.round((passCount / total) * 100) }
}

export type Winner = 'A' | 'B' | 'tie'

export interface EvalResult {
  winner: Winner
  reason: string
  reasons: string[]
  a: RunMetrics
  b: RunMetrics
}

export function computeEvalMetrics(runA: RunRecord, runB: RunRecord): EvalResult {
  const a = runMetrics(runA)
  const b = runMetrics(runB)
  const reasons: string[] = []

  if (a.failureCount !== b.failureCount) {
    const winner: Winner = a.failureCount < b.failureCount ? 'A' : 'B'
    reasons.push(`fewer failures (${a.failureCount} vs ${b.failureCount})`)
    return { winner, reason: reasons[0], reasons, a, b }
  }
  if (a.failureWeight !== b.failureWeight) {
    const winner: Winner = a.failureWeight < b.failureWeight ? 'A' : 'B'
    reasons.push('less severe failures')
    return { winner, reason: reasons[0], reasons, a, b }
  }
  if (a.firstFailIdx !== b.firstFailIdx) {
    const winner: Winner = a.firstFailIdx > b.firstFailIdx ? 'A' : 'B'
    reasons.push('later first failure')
    return { winner, reason: reasons[0], reasons, a, b }
  }
  reasons.push('identical failure profile')
  return { winner: 'tie', reason: reasons[0], reasons, a, b }
}

// ── Summary metrics for overview tab ──────────────────────────────────────

export interface SummaryMetric {
  label: string
  valueA: string
  valueB: string
  displayValue: string
  delta: string
  trend: 'up' | 'down' | 'neutral'
  color: string
}

export function computeSummaryMetrics(runA: RunRecord, runB: RunRecord): SummaryMetric[] {
  const a = runMetrics(runA)
  const b = runMetrics(runB)
  const diffs = computeDiffs(runA, runB)
  const nodesImproved = diffs.nodes.filter((n) => n.isFixed).length
  const totalNodes = diffs.nodes.length

  const bWorse = b.failureCount < a.failureCount
  const overallStatus = bWorse ? 'Improved' : a.failureCount === b.failureCount ? 'No Change' : 'Degraded'
  const overallColor = bWorse ? '#3d9e7d' : a.failureCount === b.failureCount ? '#5d6370' : '#d65c5c'

  const failDelta = a.failureCount - b.failureCount
  const failPct = a.failureCount > 0 ? Math.round((failDelta / a.failureCount) * 100) : 0

  const passDelta = b.successRate - a.successRate

  const durA = runA.duration_ms ?? 0
  const durB = runB.duration_ms ?? 0
  const durDelta = durA > 0 ? ((durA - durB) / durA) * 100 : 0

  const confA = runA.llm_investigation?.confidence ?? 0
  const confB = runB.llm_investigation?.confidence ?? 0
  const confDelta = confB - confA

  const fmtDur = (ms: number) => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
    return `${Math.round(ms)}ms`
  }

  return [
    {
      label: 'Overall Status',
      valueA: runA.overall_status,
      valueB: runB.overall_status,
      displayValue: overallStatus,
      delta: diffs.stats.fixed > 0 ? `${diffs.stats.fixed} issue${diffs.stats.fixed !== 1 ? 's' : ''} resolved` : '',
      trend: bWorse ? 'up' : a.failureCount === b.failureCount ? 'neutral' : 'down',
      color: overallColor,
    },
    {
      label: 'Nodes Improved',
      valueA: '',
      valueB: '',
      displayValue: `${nodesImproved} / ${totalNodes}`,
      delta: totalNodes > 0 ? `+${Math.round((nodesImproved / totalNodes) * 100)}%` : '',
      trend: nodesImproved > 0 ? 'up' : 'neutral',
      color: nodesImproved > 0 ? '#3d9e7d' : '#5d6370',
    },
    {
      label: 'Failures',
      valueA: String(a.failureCount),
      valueB: String(b.failureCount),
      displayValue: `${a.failureCount} \u2192 ${b.failureCount}`,
      delta: failDelta !== 0 ? `${failDelta > 0 ? '+' : ''}${-failPct}%` : '',
      trend: b.failureCount < a.failureCount ? 'up' : b.failureCount === a.failureCount ? 'neutral' : 'down',
      color: b.failureCount < a.failureCount ? '#3d9e7d' : b.failureCount === a.failureCount ? '#5d6370' : '#d65c5c',
    },
    {
      label: 'Pass Rate',
      valueA: `${a.successRate}%`,
      valueB: `${b.successRate}%`,
      displayValue: `${a.successRate}% \u2192 ${b.successRate}%`,
      delta: passDelta !== 0 ? `${passDelta > 0 ? '+' : ''}${passDelta}%` : '',
      trend: passDelta > 0 ? 'up' : passDelta === 0 ? 'neutral' : 'down',
      color: passDelta > 0 ? '#3d9e7d' : passDelta === 0 ? '#5d6370' : '#d65c5c',
    },
    {
      label: 'Duration',
      valueA: fmtDur(durA),
      valueB: fmtDur(durB),
      displayValue: `${fmtDur(durA)} \u2192 ${fmtDur(durB)}`,
      delta: durDelta !== 0 ? `${durDelta > 0 ? '+' : ''}${durDelta.toFixed(1)}%` : '',
      trend: durB < durA ? 'up' : durB === durA ? 'neutral' : 'down',
      color: durB < durA ? '#3d9e7d' : durB === durA ? '#5d6370' : '#d65c5c',
    },
    {
      label: 'Confidence',
      valueA: `${Math.round(confA * 100)}%`,
      valueB: `${Math.round(confB * 100)}%`,
      displayValue: `${Math.round(confA * 100)}% \u2192 ${Math.round(confB * 100)}%`,
      delta: confDelta !== 0 ? `${confDelta > 0 ? '+' : ''}${Math.round(confDelta * 100)}%` : '',
      trend: confDelta > 0 ? 'up' : confDelta === 0 ? 'neutral' : 'down',
      color: confDelta > 0 ? '#3d9e7d' : confDelta === 0 ? '#5d6370' : '#d65c5c',
    },
  ]
}

// ── Change impact ─────────────────────────────────────────────────────────

export interface ChangeImpact {
  positive: number
  negative: number
  unchanged: number
  structural: number
}

export function computeChangeImpact(nodes: NodeDiff[]): ChangeImpact {
  if (nodes.length === 0) return { positive: 0, negative: 0, unchanged: 100, structural: 0 }
  let positive = 0
  let negative = 0
  let unchanged = 0
  let structural = 0

  for (const n of nodes) {
    if (n.isFrozen || n.isNew) structural++
    else if (n.isFixed) positive++
    else if (n.isRegression) negative++
    else if (n.statusChanged) {
      const bBad = n.before && ['crashed', 'fail', 'semantic_fail'].includes(n.before.status)
      if (bBad) positive++
      else negative++
    } else if (n.inspectionDiffs.some((d) => d.iconColor === '#3d9e7d')) positive++
    else unchanged++
  }

  const total = nodes.length
  return {
    positive: Math.round((positive / total) * 100),
    negative: Math.round((negative / total) * 100),
    unchanged: Math.round((unchanged / total) * 100),
    structural: Math.round((structural / total) * 100),
  }
}

// ── Key changes ───────────────────────────────────────────────────────────

export interface KeyChange {
  nodeName: string
  description: string
  type: 'improved' | 'degraded' | 'unchanged' | 'structural'
}

export function computeKeyChanges(nodes: NodeDiff[]): KeyChange[] {
  return nodes.map((n) => {
    if (n.isFrozen) {
      return { nodeName: n.name, description: 'Only present in Run A', type: 'structural' as const }
    }
    if (n.isNew) {
      return { nodeName: n.name, description: 'Only present in Run B', type: 'structural' as const }
    }
    if (n.isFixed) {
      const desc = n.inspectionDiffs.length > 0
        ? n.inspectionDiffs[0].text
        : 'Status changed from failed to passed'
      return { nodeName: n.name, description: desc, type: 'improved' as const }
    }
    if (n.isRegression) {
      return { nodeName: n.name, description: 'Status regressed to failed', type: 'degraded' as const }
    }
    if (n.inspectionDiffs.length > 0) {
      const hasImprovement = n.inspectionDiffs.some((d) => d.iconColor === '#3d9e7d')
      return {
        nodeName: n.name,
        description: n.inspectionDiffs[0].text,
        type: hasImprovement ? 'improved' as const : 'degraded' as const,
      }
    }
    if (n.fieldDiffs.length > 0) {
      return {
        nodeName: n.name,
        description: 'Response quality improved',
        type: 'improved' as const,
      }
    }
    return { nodeName: n.name, description: 'No significant change', type: 'unchanged' as const }
  })
}
