'use client'

import Link from 'next/link'
import type { RunRecord, NodeEvent, StepStatus, RunStatus } from '@/lib/types'

/* ── Status styling ──────────────────────────────────────────────── */

const STATUS_DOT: Record<string, { dot: string; color: string }> = {
  clean:          { dot: '●', color: '#22c55e' },
  silent_failure: { dot: '●', color: '#f59e0b' },
  crashed:        { dot: '●', color: '#ef4444' },
  semantic_fail:  { dot: '●', color: '#d946ef' },
  interrupted:    { dot: '⏸', color: '#f59e0b' },
}

const OVERALL_STYLE: Record<string, string> = {
  clean:          'text-green-400 font-bold',
  silent_failure: 'text-amber-400 font-bold',
  crashed:        'text-red-400 font-bold',
  semantic_fail:  'text-purple-400 font-bold',
  interrupted:    'text-amber-400 font-bold',
}

const STEP_ICON: Record<string, { icon: string; color: string }> = {
  pass:          { icon: '✓', color: '#22c55e' },
  fail:          { icon: '⚠', color: '#f59e0b' },
  crashed:       { icon: '✗', color: '#ef4444' },
  semantic_fail: { icon: '⊗', color: '#d946ef' },
  interrupted:   { icon: '⏸', color: '#f59e0b' },
}

const STEP_LABEL: Record<string, { label: string; cls: string }> = {
  pass:          { label: 'pass',           cls: 'text-green-400' },
  fail:          { label: 'silent failure', cls: 'text-amber-400' },
  crashed:       { label: 'crashed',        cls: 'text-red-400' },
  semantic_fail: { label: 'semantic fail',  cls: 'text-purple-400' },
  interrupted:   { label: 'interrupted',    cls: 'text-amber-400' },
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function formatDur(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  return `${Math.round(ms)} ms`
}

function formatTs(iso: string): string {
  return iso.slice(0, 16).replace('T', '  ')
}

const STATUS_RANK: Record<string, number> = {
  pass: 0, interrupted: 1, semantic_fail: 2, fail: 3, crashed: 4,
}
const RUN_RANK: Record<string, number> = {
  clean: 0, interrupted: 1, silent_failure: 2, semantic_fail: 3, crashed: 4,
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

/* ── Diff computation ─────────────────────────────────────────────── */

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
  const bEmpty = new Set(bInsp?.empty_fields ?? [])
  const aEmpty = new Set(aInsp?.empty_fields ?? [])

  bMissing.forEach((f) => {
    if (!aMissing.has(f)) diffs.push({ text: `missing field "${f}" resolved`, icon: '✓', iconColor: '#22c55e' })
  })
  aMissing.forEach((f) => {
    if (!bMissing.has(f)) diffs.push({ text: `field "${f}" now missing`, icon: '✗', iconColor: '#ef4444' })
  })
  bEmpty.forEach((f) => {
    if (!aEmpty.has(f)) diffs.push({ text: `empty field "${f}" now populated`, icon: '✓', iconColor: '#22c55e' })
  })
  aEmpty.forEach((f) => {
    if (!bEmpty.has(f)) diffs.push({ text: `field "${f}" now empty`, icon: '~', iconColor: '#f59e0b' })
  })

  const bTf = new Set((bInsp?.tool_failures ?? []).map((t) => `${t.field_name}:${t.failure_type}`))
  const aTf = new Set((aInsp?.tool_failures ?? []).map((t) => `${t.field_name}:${t.failure_type}`))
  bTf.forEach((k) => {
    if (!aTf.has(k)) diffs.push({ text: `tool failure ${k.replace(':', ' on "')}\" resolved`, icon: '✓', iconColor: '#22c55e' })
  })
  aTf.forEach((k) => {
    if (!bTf.has(k)) diffs.push({ text: `new tool failure ${k.replace(':', ' on "')}\"`, icon: '⚠', iconColor: '#ef4444' })
  })

  const bSev = bInsp?.severity ?? 'ok'
  const aSev = aInsp?.severity ?? 'ok'
  const SEV_RANK: Record<string, number> = { ok: 0, info: 1, warning: 2, critical: 3 }
  if (bSev !== aSev) {
    const improved = (SEV_RANK[aSev] ?? 0) < (SEV_RANK[bSev] ?? 0)
    diffs.push({
      text: `severity ${bSev} → ${aSev}`,
      icon: improved ? '✓' : '~',
      iconColor: improved ? '#22c55e' : '#f59e0b',
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
      diffs.push({ name, change: 'new', icon: a ? '✓' : '⊗', iconColor: a ? '#22c55e' : '#d946ef' })
    } else if (b !== undefined && a === undefined) {
      diffs.push({ name, change: 'removed', icon: '−', iconColor: '#52525e' })
    } else if (b !== a) {
      if (!b && a) diffs.push({ name, change: 'fail → pass', icon: '✓', iconColor: '#22c55e' })
      else diffs.push({ name, change: 'pass → fail', icon: '⊗', iconColor: '#d946ef' })
    }
  })

  return diffs
}

function formatDurDiff(bMs: number | undefined, aMs: number | undefined): string {
  if (bMs === undefined || aMs === undefined) return ''
  const delta = aMs - bMs
  if (Math.abs(delta) < 100) return ''
  const sign = delta >= 0 ? '+' : ''
  const pct = bMs > 0 ? ` (${sign}${Math.round((delta / bMs) * 100)}%)` : ''
  return `${Math.round(bMs)} ms → ${Math.round(aMs)} ms${pct}`
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
      frozenNote: isFrozen ? (runB.replay_from_step ? 'frozen · not re-run' : 'only in A') : '',
      fieldDiffs,
      inspectionDiffs,
      validatorDiffs,
      durDiff,
    }
  })

  return { nodes, stats }
}

/* ── Diff category for a node ────────────────────────────────────── */

type DiffCategory = 'only-a' | 'only-b' | 'changed' | 'unchanged'

function getDiffCategory(diff: NodeDiff): DiffCategory {
  if (diff.isFrozen) return 'only-a'
  if (diff.isNew) return 'only-b'
  if (diff.statusChanged || diff.fieldDiffs.length > 0 || diff.inspectionDiffs.length > 0 || diff.validatorDiffs.length > 0) return 'changed'
  return 'unchanged'
}

const CATEGORY_LABEL: Record<DiffCategory, { text: string; color: string }> = {
  'only-a':    { text: 'Only in A', color: '#f59e0b' },
  'only-b':    { text: 'Only in B', color: '#60a5fa' },
  'changed':   { text: 'Changed',   color: '#f59e0b' },
  'unchanged': { text: '',          color: '#3a3a40' },
}

/* ── Flat node row ───────────────────────────────────────────────── */

function getEventColor(event: NodeEvent): string {
  return STEP_ICON[event.status]?.color ?? '#52525e'
}

function getEventIcon(event: NodeEvent): string {
  return STEP_ICON[event.status]?.icon ?? '●'
}

function StatusBadge({ status }: { status: string }) {
  const info = STEP_LABEL[status] ?? { label: status, cls: 'text-[#52525e]' }
  const iconInfo = STEP_ICON[status] ?? { icon: '●', color: '#52525e' }
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-sm"
      style={{ background: `${iconInfo.color}12`, color: iconInfo.color }}
    >
      {iconInfo.icon} {info.label}
    </span>
  )
}

function NodeRow({ event, index, absent, absentLabel }: {
  event: NodeEvent | undefined
  index: number
  absent?: boolean
  absentLabel?: string
}) {
  if (!event || absent) {
    return (
      <div className="flex items-center gap-3 py-2 pl-3 pr-2 min-h-[40px]">
        <span className="text-[11px] font-mono tabular-nums text-[#35353e] w-4 text-right shrink-0">{index + 1}</span>
        <span className="text-[12px] font-mono text-[#35353e] italic">{absentLabel ?? '—'}</span>
      </div>
    )
  }

  const color = getEventColor(event)

  return (
    <div className="py-2 pl-3 pr-2 min-h-[40px]">
      {/* Line 1: index + name + badge */}
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] font-mono tabular-nums text-[#52525e] w-4 text-right shrink-0">{index + 1}</span>
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: color }}
        />
        <span className="text-[13px] font-mono font-semibold text-[var(--text-primary)] truncate">{event.node_name}</span>
        <StatusBadge status={event.status} />
        <span className="text-[11px] font-mono text-[#3a3a40] tabular-nums ml-auto shrink-0">{formatDur(event.duration_ms)}</span>
      </div>

      {/* Line 2: compact metadata */}
      {(event.inspection || event.validator_results.length > 0 || event.exception) && (
        <div className="ml-[30px] mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono">
          {(event.inspection?.missing_fields?.length ?? 0) > 0 && (
            <span className="text-amber-400/60">missing: {event.inspection!.missing_fields.join(', ')}</span>
          )}
          {(event.inspection?.empty_fields?.length ?? 0) > 0 && (
            <span className="text-amber-400/40">empty: {event.inspection!.empty_fields.join(', ')}</span>
          )}
          {(event.inspection?.tool_failures?.length ?? 0) > 0 && (
            <span className="text-red-400/60">tool fail: {event.inspection!.tool_failures.map(t => t.field_name).join(', ')}</span>
          )}
          {event.validator_results.map((v) => (
            <span key={v.validator_name} className={v.is_valid ? 'text-green-400/50' : 'text-purple-400/50'}>
              {v.is_valid ? '✓' : '⊗'} {v.validator_name}
            </span>
          ))}
          {event.exception && (
            <span className="text-red-400/50 truncate max-w-[200px]" title={event.exception}>
              {event.exception.split('\n')[0].slice(0, 60)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Pipeline connector ──────────────────────────────────────────── */

function PipelineConnector({ color }: { color: string }) {
  return (
    <div className="flex justify-center" style={{ height: '12px' }}>
      <div
        className="w-px"
        style={{
          height: '100%',
          backgroundImage: `repeating-linear-gradient(to bottom, ${color}40 0px, ${color}40 2px, transparent 2px, transparent 5px)`,
        }}
      />
    </div>
  )
}

/* ── Change indicator (center column) ────────────────────────────── */

function ChangeIndicator({ diff }: { diff: NodeDiff }) {
  const cat = getDiffCategory(diff)
  const catInfo = CATEGORY_LABEL[cat]

  if (cat === 'unchanged') {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-[9px] font-mono text-[#2a2a30]">=</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-1 py-1">
      {/* Category label */}
      <span
        className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-px rounded-sm"
        style={{ color: catInfo.color, background: `${catInfo.color}10` }}
      >
        {catInfo.text}
      </span>

      {/* Fixed / Regression badge */}
      {diff.isFixed && (
        <span className="text-[9px] font-bold font-mono text-green-400">FIXED</span>
      )}
      {diff.isRegression && (
        <span className="text-[9px] font-bold font-mono text-red-400">REGRESSED</span>
      )}

      {/* Status transition */}
      {diff.statusChanged && diff.before && diff.after && (
        <div className="font-mono text-[9px] text-center leading-3">
          <span className={STEP_LABEL[diff.before.status]?.cls ?? 'text-[#52525e]'}>
            {STEP_LABEL[diff.before.status]?.label ?? diff.before.status}
          </span>
          <span className="text-[#3a3a40] mx-1">→</span>
          <span className={STEP_LABEL[diff.after.status]?.cls ?? 'text-[#52525e]'}>
            {STEP_LABEL[diff.after.status]?.label ?? diff.after.status}
          </span>
        </div>
      )}

      {/* Duration diff */}
      {diff.durDiff && (
        <div className="font-mono text-[8px] text-[#3a3a40] text-center">{diff.durDiff}</div>
      )}

      {/* Field diffs */}
      {diff.fieldDiffs.length > 0 && (
        <div className="font-mono text-[8px] text-center leading-3">
          {diff.fieldDiffs.map((fd, i) => (
            <div key={i} className={fd.type === 'added' ? 'text-green-400/60' : fd.type === 'removed' ? 'text-red-400/60' : 'text-amber-400/60'}>
              {fd.type === 'added' ? '+' : fd.type === 'removed' ? '−' : '~'} {fd.field}
            </div>
          ))}
        </div>
      )}

      {/* Inspection diffs */}
      {diff.inspectionDiffs.length > 0 && (
        <div className="font-mono text-[8px] text-center leading-3">
          {diff.inspectionDiffs.map((id, i) => (
            <div key={i} style={{ color: id.iconColor }} className="opacity-50">
              {id.icon} {id.text.length > 24 ? id.text.slice(0, 22) + '…' : id.text}
            </div>
          ))}
        </div>
      )}

      {/* Validator diffs */}
      {diff.validatorDiffs.length > 0 && (
        <div className="font-mono text-[8px] text-center leading-3">
          {diff.validatorDiffs.map((vd, i) => (
            <div key={i} style={{ color: vd.iconColor }} className="opacity-50">
              {vd.icon} {vd.name} {vd.change}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Side-by-side row ────────────────────────────────────────────── */

function SideBySideRow({ diff, index, isLast, isFirstDivergence }: {
  diff: NodeDiff
  index: number
  isLast: boolean
  isFirstDivergence: boolean
}) {
  const cat = getDiffCategory(diff)

  /* ── Unchanged: collapsed single-line row ── */
  if (cat === 'unchanged') {
    const color = diff.before ? getEventColor(diff.before) : '#2a2a30'
    return (
      <div>
        <div
          className="flex items-center gap-2.5 py-1.5 pl-3 pr-2 font-mono"
          style={{
            borderBottom: isLast ? 'none' : '1px solid #1a1a1f',
            opacity: 0.4,
          }}
        >
          <span className="text-[11px] tabular-nums text-[#35353e] w-4 text-right shrink-0">{index + 1}</span>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-[12px] text-[#52525e] truncate">{diff.name}</span>
        </div>
        {!isLast && (
          <div className="flex justify-center" style={{ height: '6px' }}>
            <div className="w-px" style={{ height: '100%', background: `${color}20` }} />
          </div>
        )}
      </div>
    )
  }

  /* ── Changed / only-a / only-b: full side-by-side row ── */
  const beforeColor = diff.before ? getEventColor(diff.before) : '#2a2a30'
  const afterColor = diff.after ? getEventColor(diff.after) : '#2a2a30'

  const highlightStyle = isFirstDivergence
    ? { boxShadow: `inset 2px 0 0 ${CATEGORY_LABEL[cat].color}` }
    : {}

  return (
    <div>
      <div
        className="grid font-mono"
        style={{
          gridTemplateColumns: '1fr 72px 1fr',
          ...highlightStyle,
        }}
      >
        {/* Before */}
        <div
          style={{
            borderBottom: isLast ? 'none' : '1px solid #1a1a1f',
          }}
        >
          <NodeRow
            event={diff.before}
            index={index}
            absent={diff.isNew}
            absentLabel="—"
          />
        </div>

        {/* Center: change */}
        <div
          className="flex items-center justify-center"
          style={{
            borderBottom: isLast ? 'none' : '1px solid #1a1a1f',
            borderLeft: '1px solid #1a1a1f',
            borderRight: '1px solid #1a1a1f',
          }}
        >
          <ChangeIndicator diff={diff} />
        </div>

        {/* After */}
        <div
          style={{
            borderBottom: isLast ? 'none' : '1px solid #1a1a1f',
          }}
        >
          <NodeRow
            event={diff.after}
            index={index}
            absent={diff.isFrozen}
            absentLabel={diff.frozenNote || '—'}
          />
        </div>
      </div>

      {/* Vertical connector lines */}
      {!isLast && (
        <div className="grid" style={{ gridTemplateColumns: '1fr 72px 1fr' }}>
          <div className="flex justify-center">
            <PipelineConnector color={beforeColor} />
          </div>
          <div />
          <div className="flex justify-center">
            <PipelineConnector color={afterColor} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main DiffView ────────────────────────────────────────────────── */

export default function DiffView({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const { nodes, stats } = computeDiffs(runA, runB)
  const aInfo = STATUS_DOT[runA.overall_status] ?? { dot: '●', color: '#52525e' }
  const bInfo = STATUS_DOT[runB.overall_status] ?? { dot: '●', color: '#52525e' }

  // Find index of first divergent node
  const firstDivIdx = nodes.findIndex((d) => getDiffCategory(d) !== 'unchanged')

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: '1px solid #1a1a1f',
        background: 'var(--bg-surface)',
      }}
    >
      {/* ── Titlebar ────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-2"
        style={{ borderBottom: '1px solid #1a1a1f' }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: '#2a2a30' }} />
          <span className="w-2 h-2 rounded-full" style={{ background: '#2a2a30' }} />
          <span className="w-2 h-2 rounded-full" style={{ background: '#2a2a30' }} />
        </div>
        <span className="text-[11px] font-mono text-[#52525e]">
          argus diff {runA.run_id.slice(0, 8)} {runB.run_id.slice(0, 8)}
        </span>
      </div>

      <div className="py-3 font-mono text-[13px]">

        {/* ── Column headers ─────────────────────────────────────── */}
        <div className="px-3 grid" style={{ gridTemplateColumns: '1fr 72px 1fr' }}>
          {/* A header */}
          <div className="flex items-center gap-2 py-1.5 px-2 text-[11px]">
            <span className="text-[#52525e] font-semibold uppercase tracking-wider text-[10px]">A</span>
            <Link href={`/runs/${runA.run_id}`} className="text-[#52525e] hover:text-blue-400 transition-colors">{runA.run_id.slice(0, 8)}</Link>
            <span className="text-[#2a2a30]">{formatTs(runA.started_at)}</span>
            <span style={{ color: aInfo.color }} className="text-[10px]">{aInfo.dot}</span>
            <span className={`${OVERALL_STYLE[runA.overall_status] ?? 'text-[#52525e]'} text-[11px]`}>{runA.overall_status}</span>
          </div>

          <div />

          {/* B header */}
          <div className="flex items-center gap-2 py-1.5 px-2 text-[11px]">
            <span className="text-[#52525e] font-semibold uppercase tracking-wider text-[10px]">B</span>
            <Link href={`/runs/${runB.run_id}`} className="text-[#52525e] hover:text-blue-400 transition-colors">{runB.run_id.slice(0, 8)}</Link>
            <span className="text-[#2a2a30]">{formatTs(runB.started_at)}</span>
            <span style={{ color: bInfo.color }} className="text-[10px]">{bInfo.dot}</span>
            <span className={`${OVERALL_STYLE[runB.overall_status] ?? 'text-[#52525e]'} text-[11px]`}>{runB.overall_status}</span>
            {runB.replay_from_step && (
              <span className="text-[#3a3a40] italic text-[10px]">replay: {runB.replay_from_step}</span>
            )}
          </div>
        </div>

        {/* ── Thin separator ─────────────────────────────────────── */}
        <div className="mx-3 mt-1 mb-2" style={{ height: '1px', background: '#1a1a1f' }} />

        {/* ── Node pipeline rows ─────────────────────────────────── */}
        <div className="px-3">
          {nodes.map((diff, i) => (
            <SideBySideRow
              key={diff.name}
              diff={diff}
              index={i}
              isLast={i === nodes.length - 1}
              isFirstDivergence={i === firstDivIdx}
            />
          ))}
        </div>

        {/* ── Thin separator ─────────────────────────────────────── */}
        <div className="mx-3 mt-2 mb-2" style={{ height: '1px', background: '#1a1a1f' }} />

        {/* ── Summary line ───────────────────────────────────────── */}
        <div className="px-4 flex items-baseline gap-0 flex-wrap font-mono text-[12px] leading-6">
          {stats.changed > 0 && (
            <>
              <span className="text-[var(--text-primary)] font-bold mr-1">{stats.changed}</span>
              <span className="text-[#52525e] mr-3">changed</span>
            </>
          )}
          {stats.fixed > 0 && (
            <>
              <span className="text-green-400 font-bold mr-1">{stats.fixed}</span>
              <span className="text-green-400/60 mr-3">fixed</span>
            </>
          )}
          {stats.regressed > 0 && (
            <>
              <span className="text-red-400 font-bold mr-1">{stats.regressed}</span>
              <span className="text-red-400/60 mr-3">regressed</span>
            </>
          )}
          {stats.new_ > 0 && (
            <>
              <span className="text-blue-400 font-bold mr-1">{stats.new_}</span>
              <span className="text-blue-400/60 mr-3">new</span>
            </>
          )}
          {stats.frozen > 0 && (
            <span className="text-[#3a3a40] mr-3">{stats.frozen} only in A</span>
          )}
          {stats.changed === 0 && stats.new_ === 0 && stats.frozen === 0 && (
            <span className="text-[#3a3a40]">no changes</span>
          )}
        </div>

        {/* ── Root cause comparison ──────────────────────────────── */}
        {(runA.root_cause_chain?.length > 0 || runB.root_cause_chain?.length > 0) && (
          <>
            <div className="mx-3 my-2" style={{ height: '1px', background: '#1a1a1f' }} />
            <div className="px-4 font-mono text-[11px] leading-6">
              {runA.root_cause_chain?.length > 0 && runB.root_cause_chain?.length > 0 ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-[#3a3a40]">root cause</span>
                  <span className="text-red-400/60">{runA.root_cause_chain.join(' → ')}</span>
                  <span className="text-[#3a3a40]">→</span>
                  <span className="text-red-400 font-bold">{runB.root_cause_chain.join(' → ')}</span>
                </div>
              ) : runB.root_cause_chain?.length > 0 ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-[#3a3a40]">root cause</span>
                  <span className="text-red-400 font-bold">{runB.root_cause_chain.join(' → ')}</span>
                  <span className="text-blue-400/40 text-[10px]">new</span>
                </div>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-[#3a3a40]">root cause</span>
                  <span className="text-green-400 font-bold">resolved</span>
                  <span className="text-[#3a3a40] text-[10px]">was: {runA.root_cause_chain?.join(' → ')}</span>
                </div>
              )}
            </div>
          </>
        )}

        <div className="h-1" />
      </div>
    </div>
  )
}
