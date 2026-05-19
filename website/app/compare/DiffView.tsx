'use client'

import type { RunRecord, NodeEvent } from '@/lib/types'

// ── Status maps ───────────────────────────────────────────────────────────

const STEP_ICON: Record<string, { icon: string; color: string }> = {
  pass:           { icon: '\u2713', color: '#10b981' },
  degraded_input: { icon: '\u2B07', color: '#f59e0b' },
  fail:           { icon: '\u26A0', color: '#f59e0b' },
  crashed:        { icon: '\u2717', color: '#ef4444' },
  semantic_fail:  { icon: '\u2298', color: '#a855f7' },
  interrupted:    { icon: '\u23F8', color: '#f59e0b' },
}

const STEP_LABEL: Record<string, { label: string; cls: string }> = {
  pass:           { label: 'pass',           cls: 'text-emerald-600' },
  degraded_input: { label: 'degraded input', cls: 'text-amber-600' },
  fail:           { label: 'silent failure', cls: 'text-amber-600' },
  crashed:        { label: 'crashed',        cls: 'text-red-600' },
  semantic_fail:  { label: 'semantic fail',  cls: 'text-purple-600' },
  interrupted:    { label: 'interrupted',    cls: 'text-amber-600' },
}

const OVERALL_STYLE: Record<string, string> = {
  clean:          'text-emerald-600',
  silent_failure: 'text-amber-600',
  crashed:        'text-red-600',
  semantic_fail:  'text-purple-600',
  interrupted:    'text-amber-600',
}

const STATUS_DOT: Record<string, { color: string }> = {
  clean:          { color: '#10b981' },
  silent_failure: { color: '#f59e0b' },
  crashed:        { color: '#ef4444' },
  semantic_fail:  { color: '#a855f7' },
  interrupted:    { color: '#f59e0b' },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDur(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)} ms`
}

function formatTs(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

function getEventColor(event: NodeEvent): string {
  return STEP_ICON[event.status]?.color ?? '#9ca3af'
}

function getEventIcon(event: NodeEvent): string {
  return STEP_ICON[event.status]?.icon ?? '●'
}

// ── Diff computation ───────────────────────────────────────────────────────

interface FieldDiff {
  field: string
  type: 'added' | 'removed' | 'changed'
}

interface InspectionDiff {
  text: string
  icon: string
  iconColor: string
}

interface ValidatorDiff {
  name: string
  change: string
  icon: string
  iconColor: string
}

interface NodeDiff {
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

function buildNodeMap(run: RunRecord): Map<string, NodeEvent> {
  const map = new Map<string, NodeEvent>()
  for (const e of run.steps ?? []) map.set(e.node_name, e)
  return map
}

function orderedNodes(a: RunRecord, b: RunRecord): string[] {
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

function diffOutput(before: Record<string, unknown> | null, after: Record<string, unknown> | null): FieldDiff[] {
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

function diffInspection(before: NodeEvent | undefined, after: NodeEvent | undefined): InspectionDiff[] {
  const bInsp = before?.inspection
  const aInsp = after?.inspection
  if (!bInsp && !aInsp) return []
  const diffs: InspectionDiff[] = []

  const bMissing = new Set(bInsp?.missing_fields ?? [])
  const aMissing = new Set(aInsp?.missing_fields ?? [])

  bMissing.forEach((f) => {
    if (!aMissing.has(f)) diffs.push({ text: `missing "${f}" resolved`, icon: '✓', iconColor: '#10b981' })
  })
  aMissing.forEach((f) => {
    if (!bMissing.has(f)) diffs.push({ text: `"${f}" now missing`, icon: '✗', iconColor: '#ef4444' })
  })

  const bSev = bInsp?.severity ?? 'ok'
  const aSev = aInsp?.severity ?? 'ok'
  const SEV_RANK: Record<string, number> = { ok: 0, info: 1, warning: 2, critical: 3 }
  if (bSev !== aSev) {
    const improved = (SEV_RANK[aSev] ?? 0) < (SEV_RANK[bSev] ?? 0)
    diffs.push({
      text: `severity ${bSev} → ${aSev}`,
      icon: improved ? '✓' : '~',
      iconColor: improved ? '#10b981' : '#f59e0b',
    })
  }

  return diffs
}

function diffValidators(before: NodeEvent | undefined, after: NodeEvent | undefined): ValidatorDiff[] {
  const bMap = new Map((before?.validator_results ?? []).map((v) => [v.validator_name, v.is_valid]))
  const aMap = new Map((after?.validator_results ?? []).map((v) => [v.validator_name, v.is_valid]))
  const allNames = new Set([...Array.from(bMap.keys()), ...Array.from(aMap.keys())])
  const diffs: ValidatorDiff[] = []

  allNames.forEach((name) => {
    const b = bMap.get(name)
    const a = aMap.get(name)
    if (b === undefined && a !== undefined) {
      diffs.push({ name, change: 'new', icon: a ? '✓' : '⊗', iconColor: a ? '#10b981' : '#a855f7' })
    } else if (b !== undefined && a === undefined) {
      diffs.push({ name, change: 'removed', icon: '−', iconColor: '#9ca3af' })
    } else if (b !== a) {
      if (!b && a) diffs.push({ name, change: 'fail → pass', icon: '✓', iconColor: '#10b981' })
      else diffs.push({ name, change: 'pass → fail', icon: '⊗', iconColor: '#a855f7' })
    }
  })

  return diffs
}

function formatDurDiff(bMs: number | undefined, aMs: number | undefined): string {
  if (bMs === undefined || aMs === undefined) return ''
  const delta = aMs - bMs
  if (Math.abs(delta) < 100) return ''
  const sign = delta >= 0 ? '+' : ''
  return `${sign}${Math.round(delta)} ms`
}

function computeDiffs(runA: RunRecord, runB: RunRecord): { nodes: NodeDiff[]; stats: Record<string, number> } {
  const mapA = buildNodeMap(runA)
  const mapB = buildNodeMap(runB)
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

interface RunMetrics {
  failureCount: number
  failureWeight: number
  firstFailIdx: number
  successRate: number
}

function runMetrics(run: RunRecord): RunMetrics {
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

type Winner = 'A' | 'B' | 'tie'

interface EvalResult {
  winner: Winner
  reason: string
  reasons: string[]
  a: RunMetrics
  b: RunMetrics
}

function computeEvalMetrics(runA: RunRecord, runB: RunRecord): EvalResult {
  const a = runMetrics(runA)
  const b = runMetrics(runB)
  const reasons: string[] = []

  if (a.failureCount !== b.failureCount) {
    const winner: Winner = a.failureCount < b.failureCount ? 'A' : 'B'
    reasons.push(`fewer failures (${a.failureCount} vs ${b.failureCount})`)
    if (runA.duration_ms && runB.duration_ms && Math.abs(runA.duration_ms - runB.duration_ms) > 200) {
      const faster = runA.duration_ms < runB.duration_ms ? 'A' : 'B'
      if (faster === winner) reasons.push(`faster (${formatDur(runA.duration_ms)} vs ${formatDur(runB.duration_ms)})`)
    }
    return { winner, reason: reasons[0], reasons, a, b }
  }
  if (a.failureWeight !== b.failureWeight) {
    const winner: Winner = a.failureWeight < b.failureWeight ? 'A' : 'B'
    reasons.push('less severe failures')
    return { winner, reason: reasons[0], reasons, a, b }
  }
  if (a.firstFailIdx !== b.firstFailIdx) {
    const winner: Winner = a.firstFailIdx > b.firstFailIdx ? 'A' : 'B'
    const aStep = a.firstFailIdx === Infinity ? 'none' : `step ${a.firstFailIdx + 1}`
    const bStep = b.firstFailIdx === Infinity ? 'none' : `step ${b.firstFailIdx + 1}`
    reasons.push(`failure at ${aStep} vs ${bStep}`)
    return { winner, reason: reasons[0], reasons, a, b }
  }
  reasons.push('identical failure profile')
  return { winner: 'tie', reason: reasons[0], reasons, a, b }
}

// ── Winner Banner ──────────────────────────────────────────────────────────

function WinnerBanner({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const { winner, reasons, a, b } = computeEvalMetrics(runA, runB)

  const fixedCount = (runA.steps ?? []).filter((s) => ['crashed', 'fail', 'semantic_fail'].includes(s.status)).length
    - (runB.steps ?? []).filter((s) => ['crashed', 'fail', 'semantic_fail'].includes(s.status)).length

  if (winner === 'tie') {
    return (
      <div className="py-10 text-center">
        <div className="text-[11px] font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>
          result
        </div>
        <div className="text-3xl font-mono font-bold mb-4" style={{ color: '#f59e0b' }}>
          Tie
        </div>
        <p className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
          {reasons[0]}
        </p>
      </div>
    )
  }

  const winnerRun = winner === 'A' ? runA : runB
  const winnerMetrics = winner === 'A' ? a : b

  return (
    <div className="py-10 text-center">
      <div className="text-[11px] font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>
        winner
      </div>
      <div className="text-3xl font-mono font-bold mb-1" style={{ color: '#10b981' }}>
        Run {winner}
        <span className="ml-3 text-lg" style={{ color: 'var(--text-faint)' }}>
          {winnerRun.run_id.slice(0, 8)}
        </span>
      </div>
      <div className="mt-4 space-y-1.5">
        {reasons.map((r, i) => (
          <p key={i} className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
            — {r}
          </p>
        ))}
        {winnerMetrics.failureCount === 0 && (
          <p className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
            — {winnerMetrics.successRate}% success rate
          </p>
        )}
        {fixedCount > 0 && winner === 'B' && (
          <p className="text-sm font-mono text-green-400/70">
            — fixed {fixedCount} failure{fixedCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Metrics Table ──────────────────────────────────────────────────────────

function MetricsTable({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const { a, b, winner } = computeEvalMetrics(runA, runB)

  function cellWinner(aVal: number, bVal: number, higherIsBetter = false): Winner {
    if (aVal === bVal) return 'tie'
    return (higherIsBetter ? aVal > bVal : aVal < bVal) ? 'A' : 'B'
  }

  const rows: { label: string; aVal: string; bVal: string; rowWinner: Winner }[] = [
    {
      label: 'Failures',
      aVal: String(a.failureCount),
      bVal: String(b.failureCount),
      rowWinner: cellWinner(a.failureCount, b.failureCount),
    },
    {
      label: 'Duration',
      aVal: formatDur(runA.duration_ms),
      bVal: formatDur(runB.duration_ms),
      rowWinner: cellWinner(runA.duration_ms ?? 0, runB.duration_ms ?? 0),
    },
    {
      label: 'Success',
      aVal: `${a.successRate}%`,
      bVal: `${b.successRate}%`,
      rowWinner: cellWinner(a.successRate, b.successRate, true),
    },
  ]

  // Add cost row if available
  if (runA.total_cost_usd != null || runB.total_cost_usd != null) {
    const aCost = runA.total_cost_usd ?? 0
    const bCost = runB.total_cost_usd ?? 0
    rows.push({
      label: 'Cost',
      aVal: aCost > 0 ? `$${aCost < 0.01 ? aCost.toFixed(4) : aCost.toFixed(3)}` : '—',
      bVal: bCost > 0 ? `$${bCost < 0.01 ? bCost.toFixed(4) : bCost.toFixed(3)}` : '—',
      rowWinner: cellWinner(aCost, bCost),
    })
  }

  const aStatus = STATUS_DOT[runA.overall_status] ?? { color: '#9ca3af' }
  const bStatus = STATUS_DOT[runB.overall_status] ?? { color: '#9ca3af' }

  return (
    <div className="font-mono text-sm max-w-lg mx-auto">
      {/* Run ID headers */}
      <div className="grid mb-3" style={{ gridTemplateColumns: '100px 1fr 1fr 40px' }}>
        <span />
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>A</span>
          <a
            href={`/runs/${runA.run_id}`}
            className="text-[11px] hover:text-blue-400 transition-colors truncate"
            style={{ color: 'var(--text-muted)' }}
          >
            {runA.run_id.slice(0, 8)}
          </a>
          <span className="text-[10px]" style={{ color: aStatus.color }}>●</span>
          <span className={`text-[10px] ${OVERALL_STYLE[runA.overall_status] ?? ''}`}>{runA.overall_status}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>B</span>
          <a
            href={`/runs/${runB.run_id}`}
            className="text-[11px] hover:text-blue-400 transition-colors truncate"
            style={{ color: 'var(--text-muted)' }}
          >
            {runB.run_id.slice(0, 8)}
          </a>
          <span className="text-[10px]" style={{ color: bStatus.color }}>●</span>
          <span className={`text-[10px] ${OVERALL_STYLE[runB.overall_status] ?? ''}`}>{runB.overall_status}</span>
        </div>
        <span />
      </div>

      {/* Separator */}
      <div className="mb-2" style={{ height: '1px', background: 'var(--border-subtle)' }} />

      {/* Metric rows */}
      {rows.map((row) => {
        const checkA = row.rowWinner === 'A'
        const checkB = row.rowWinner === 'B'
        return (
          <div
            key={row.label}
            className="grid items-center py-1.5"
            style={{ gridTemplateColumns: '100px 1fr 1fr 40px' }}
          >
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
            <span
              className="text-[13px] tabular-nums"
              style={{ color: checkA ? '#10b981' : 'var(--text-secondary)' }}
            >
              {row.aVal}
            </span>
            <span
              className="text-[13px] tabular-nums"
              style={{ color: checkB ? '#10b981' : 'var(--text-secondary)' }}
            >
              {row.bVal}
            </span>
            <span className="text-[10px] text-right" style={{ color: '#10b981' }}>
              {row.rowWinner !== 'tie' ? `${row.rowWinner} ✓` : ''}
            </span>
          </div>
        )
      })}

      <div className="mt-2" style={{ height: '1px', background: 'var(--border-subtle)' }} />
    </div>
  )
}

// ── Diff Flow Row ──────────────────────────────────────────────────────────

interface DetailItem {
  text: string
  color?: string
}

function getDetailItems(event: NodeEvent | undefined): DetailItem[] {
  if (!event || event.status === 'pass' || event.status === 'interrupted') return []
  const items: DetailItem[] = []
  const baseColor = getEventColor(event)

  if (event.status === 'crashed' && event.exception) {
    items.push({ text: event.exception.split('\n')[0].slice(0, 100), color: '#ef4444' })
  }

  const insp = event.inspection
  if (insp?.missing_fields?.length) {
    const shown = insp.missing_fields.slice(0, 4)
    const extra = insp.missing_fields.length - shown.length
    items.push({
      text: `missing: ${shown.join(', ')}${extra > 0 ? ` +${extra}` : ''}`,
      color: baseColor,
    })
  }

  if (insp?.tool_failures?.length) {
    for (const tf of insp.tool_failures.slice(0, 2)) {
      items.push({
        text: `${tf.failure_type}${tf.field_name ? ` on '${tf.field_name}'` : ''}${tf.evidence ? `: ${tf.evidence.slice(0, 60)}` : ''}`,
        color: tf.severity === 'critical' ? '#ef4444' : '#f59e0b',
      })
    }
    if (insp.tool_failures.length > 2) {
      items.push({ text: `+${insp.tool_failures.length - 2} more failures`, color: baseColor })
    }
  }

  if (!items.length && insp?.message) {
    items.push({ text: insp.message.slice(0, 100), color: baseColor })
  }

  if (!items.length) {
    const failedValidator = event.validator_results?.find((v) => !v.is_valid)
    if (failedValidator?.message) {
      items.push({ text: failedValidator.message.slice(0, 100), color: baseColor })
    }
  }

  return items
}

function NodeSideDetail({ items, align }: { items: DetailItem[]; align: 'left' | 'right' }) {
  if (!items.length) return null
  return (
    <div className={`space-y-0.5 ${align === 'right' ? 'text-left' : 'text-right'}`}>
      {items.map((item, i) => (
        <div
          key={i}
          className="text-[11px] font-mono truncate"
          style={{ color: item.color ?? 'var(--text-secondary)', opacity: 0.8 }}
          title={item.text}
        >
          {item.text}
        </div>
      ))}
    </div>
  )
}

type DiffCategory = 'only-a' | 'only-b' | 'changed' | 'unchanged'

function getDiffCategory(diff: NodeDiff): DiffCategory {
  if (diff.isFrozen) return 'only-a'
  if (diff.isNew) return 'only-b'
  if (diff.statusChanged || diff.fieldDiffs.length > 0 || diff.inspectionDiffs.length > 0 || diff.validatorDiffs.length > 0) return 'changed'
  return 'unchanged'
}

function DiffRow({ diff }: { diff: NodeDiff }) {
  const cat = getDiffCategory(diff)
  const isChanged = cat !== 'unchanged'

  const beforeColor = diff.before ? getEventColor(diff.before) : '#2a2a30'
  const afterColor = diff.after ? getEventColor(diff.after) : '#2a2a30'
  const beforeIcon = diff.before ? getEventIcon(diff.before) : null
  const afterIcon = diff.after ? getEventIcon(diff.after) : null

  const beforeItems = getDetailItems(diff.before)
  const afterItems = getDetailItems(diff.after)
  const hasDetail = beforeItems.length > 0 || afterItems.length > 0

  return (
    <div className="mb-1" style={{ opacity: isChanged ? 1 : 0.22 }}>
      {/* Node name + status row */}
      <div className="flex items-center font-mono py-1.5 text-[13px]">
        {/* A side — right aligned */}
        <div className="flex-1 flex items-center justify-end gap-2.5 pr-5">
          {diff.before ? (
            <>
              <span style={{ color: isChanged ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {diff.before.node_name}
              </span>
              <span style={{ color: beforeColor }}>{beforeIcon}</span>
            </>
          ) : (
            <span style={{ color: '#2a2a30' }}>—</span>
          )}
        </div>

        {/* Pipe separator */}
        <div
          className="shrink-0 self-stretch"
          style={{ width: '1px', background: isChanged ? 'var(--border-default)' : 'var(--border-subtle)' }}
        />

        {/* B side — left aligned */}
        <div className="flex-1 flex items-center gap-2.5 pl-5">
          {diff.after ? (
            <>
              <span style={{ color: isChanged ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {diff.after.node_name}
              </span>
              <span style={{ color: afterColor }}>{afterIcon}</span>
              {diff.isFixed && (
                <span className="text-[10px] font-bold tracking-widest text-green-400">FIXED</span>
              )}
              {diff.isRegression && (
                <span className="text-[10px] font-bold tracking-widest text-red-400">REGRESSED</span>
              )}
              {diff.isNew && (
                <span className="text-[10px] font-bold tracking-widest text-blue-400">NEW</span>
              )}
              {diff.durDiff && !diff.isFixed && !diff.isRegression && (
                <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{diff.durDiff}</span>
              )}
              {(() => {
                const sigs = diff.after?.inspection?.semantic_signals
                if (!sigs?.length) return null
                const hasCritical = sigs.some((s) => s.severity === 'critical')
                return (
                  <span
                    className="text-[10px] font-mono"
                    style={{ color: hasCritical ? '#ef4444' : '#f59e0b' }}
                  >
                    ⚑ {sigs.length} signal{sigs.length > 1 ? 's' : ''}
                  </span>
                )
              })()}
            </>
          ) : (
            <span style={{ color: '#2a2a30' }}>{diff.frozenNote || '—'}</span>
          )}
        </div>
      </div>

      {/* Per-side detail rows — split by the same center pipe */}
      {hasDetail && (
        <div className="flex pb-2">
          {/* A detail — right aligned */}
          <div className="flex-1 flex justify-end pr-5 overflow-hidden">
            <NodeSideDetail items={beforeItems} align="right" />
          </div>

          {/* Center pipe (matches node row pipe width) */}
          <div className="shrink-0" style={{ width: '1px' }} />

          {/* B detail — left aligned */}
          <div className="flex-1 pl-5 overflow-hidden">
            <NodeSideDetail items={afterItems} align="left" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Diff Flow Section ──────────────────────────────────────────────────────

function DiffFlow({
  nodes,
  runA,
  runB,
}: {
  nodes: NodeDiff[]
  runA: RunRecord
  runB: RunRecord
}) {
  return (
    <div>
      {/* Column headers */}
      <div className="flex items-center font-mono text-[11px] mb-3" style={{ color: 'var(--text-faint)' }}>
        <div className="flex-1 text-right pr-5 uppercase tracking-widest">A</div>
        <div className="shrink-0 w-px" />
        <div className="flex-1 pl-5 uppercase tracking-widest">B</div>
      </div>

      <div className="mb-4" style={{ height: '1px', background: 'var(--border-subtle)' }} />

      {/* Rows */}
      <div>
        {nodes.map((diff) => (
          <DiffRow key={diff.name} diff={diff} />
        ))}
      </div>

      <div className="mt-4" style={{ height: '1px', background: 'var(--border-subtle)' }} />

      {/* Root cause comparison */}
      {(runA.root_cause_chain?.length > 0 || runB.root_cause_chain?.length > 0) && (
        <div className="mt-3 font-mono text-[12px]" style={{ color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-faint)' }}>root cause  </span>
          {runA.root_cause_chain?.length > 0 ? (
            <span style={{ color: '#ef4444' }}>{runA.root_cause_chain.join(' → ')}</span>
          ) : (
            <span style={{ color: '#3a3a40' }}>none</span>
          )}
          <span style={{ color: 'var(--text-faint)' }}> → </span>
          {runB.root_cause_chain?.length > 0 ? (
            <span style={{ color: '#ef4444', fontWeight: 700 }}>{runB.root_cause_chain.join(' → ')}</span>
          ) : (
            <span style={{ color: '#10b981', fontWeight: 700 }}>resolved</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Summary Line ───────────────────────────────────────────────────────────

function SummaryLine({ stats }: { stats: Record<string, number> }) {
  if (stats.changed === 0 && stats.new_ === 0 && stats.frozen === 0) {
    return (
      <p className="font-mono text-[12px] text-center" style={{ color: 'var(--text-faint)' }}>
        no changes
      </p>
    )
  }

  return (
    <p className="font-mono text-[12px] text-center" style={{ color: 'var(--text-secondary)' }}>
      {stats.changed > 0 && (
        <span className="mr-3">
          <span style={{ color: 'var(--text-primary)' }}>{stats.changed}</span> changed
        </span>
      )}
      {stats.fixed > 0 && (
        <span className="mr-3">
          <span className="text-green-400">{stats.fixed}</span>
          <span className="text-green-400/60"> fixed</span>
        </span>
      )}
      {stats.regressed > 0 && (
        <span className="mr-3">
          <span className="text-red-400">{stats.regressed}</span>
          <span className="text-red-400/60"> regressed</span>
        </span>
      )}
      {stats.new_ > 0 && (
        <span className="mr-3">
          <span className="text-blue-400">{stats.new_}</span>
          <span className="text-blue-400/60"> new</span>
        </span>
      )}
      {stats.frozen > 0 && (
        <span style={{ color: 'var(--text-faint)' }}>{stats.frozen} only in A</span>
      )}
    </p>
  )
}

// ── Main DiffView ──────────────────────────────────────────────────────────

export default function DiffView({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const { nodes, stats } = computeDiffs(runA, runB)

  return (
    <div className="space-y-10">
      {/* 1. Winner */}
      <WinnerBanner runA={runA} runB={runB} />

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

      {/* 2. Metrics table */}
      <MetricsTable runA={runA} runB={runB} />

      {/* 3. Diff flow */}
      <DiffFlow nodes={nodes} runA={runA} runB={runB} />

      {/* 4. Summary */}
      <SummaryLine stats={stats} />
    </div>
  )
}
