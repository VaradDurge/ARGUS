'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { RunRecord, NodeEvent, ValidatorResult } from '@/lib/types'
import JsonViewer from './JsonViewer'

/* ── Replay state ─────────────────────────────────────────────────── */

type ReplayPhase = 'idle' | 'submitting' | 'polling' | 'done' | 'error' | 'no_factory'

interface ReplayState {
  phase: ReplayPhase
  jobId?: string
  newRunId?: string
  message?: string
}

/* ── Constants matching CLI exactly ────────────────────────────────── */

const STATUS_DOT: Record<string, { dot: string; color: string }> = {
  clean:          { dot: '●', color: '#22c55e' },
  silent_failure: { dot: '●', color: '#f59e0b' },
  crashed:        { dot: '●', color: '#ef4444' },
  semantic_fail:  { dot: '●', color: '#d946ef' },
  interrupted:    { dot: '⏸', color: '#f59e0b' },
}

const STATUS_LABEL_STYLE: Record<string, string> = {
  clean:          'text-green-400 font-bold',
  silent_failure: 'text-amber-400 font-bold',
  crashed:        'text-red-400 font-bold',
  semantic_fail:  'text-purple-400 font-bold',
  interrupted:    'text-amber-400 font-bold',
}

const SENTINEL_NODES = new Set(['__start__', '__end__', 'START', 'END'])

/* ── Helpers ──────────────────────────────────────────────────────── */

function formatDur(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  return `${Math.round(ms)} ms`
}

function formatTimestamp(iso: string): string {
  return iso.slice(0, 16).replace('T', '  ')
}

/* ── Topology (port of CLI _topology_lines) ───────────────────────── */

function dagLayers(
  edgeMap: Record<string, string[]>,
  nodeNames: string[],
): string[][] {
  const known = new Set(nodeNames)
  const inDegree: Record<string, number> = {}
  for (const n of nodeNames) inDegree[n] = 0
  for (const [src, dests] of Object.entries(edgeMap)) {
    if (!known.has(src)) continue
    for (const dst of dests) {
      if (known.has(dst)) inDegree[dst] = (inDegree[dst] ?? 0) + 1
    }
  }

  const remaining = { ...inDegree }
  let queue = nodeNames.filter((n) => (inDegree[n] ?? 0) === 0)
  const layers: string[][] = []
  const visited = new Set<string>()
  const nameOrder = new Map(nodeNames.map((n, i) => [n, i]))

  while (queue.length > 0) {
    layers.push([...queue])
    for (const n of queue) visited.add(n)
    const nextLayer: string[] = []
    for (const node of queue) {
      for (const dst of edgeMap[node] ?? []) {
        if (!known.has(dst) || visited.has(dst)) continue
        remaining[dst]--
        if (remaining[dst] === 0 && !nextLayer.includes(dst)) nextLayer.push(dst)
      }
    }
    nextLayer.sort((a, b) => (nameOrder.get(a) ?? nodeNames.length) - (nameOrder.get(b) ?? nodeNames.length))
    queue = nextLayer
  }
  return layers
}

interface TopoItem {
  type: 'seq' | 'parallel'
  node?: string
  nodes?: string[]
  tail?: string[]
}

function topologyLines(
  edgeMap: Record<string, string[]>,
  nodeNames: string[],
): string[] {
  const nodes = nodeNames.filter((n) => !SENTINEL_NODES.has(n))
  const cleanMap: Record<string, string[]> = {}
  for (const [src, dests] of Object.entries(edgeMap)) {
    if (SENTINEL_NODES.has(src)) continue
    cleanMap[src] = dests.filter((d) => !SENTINEL_NODES.has(d))
  }
  if (nodes.length === 0) return []

  const layers = dagLayers(cleanMap, nodes)
  if (layers.length === 0) return [nodes.join(' → ')]

  const items: TopoItem[] = []
  let i = 0
  while (i < layers.length) {
    const layer = layers[i]
    if (layer.length === 1) {
      items.push({ type: 'seq', node: layer[0] })
      i++
    } else {
      const tail: string[] = []
      let j = i + 1
      while (j < layers.length && layers[j].length === 1) {
        tail.push(layers[j][0])
        j++
      }
      items.push({ type: 'parallel', nodes: layer, tail })
      i = j
    }
  }

  const result: string[] = []
  const seqBuf: string[] = []

  function flush() {
    if (seqBuf.length > 0) {
      result.push(seqBuf.join(' → '))
      seqBuf.length = 0
    }
  }

  for (const item of items) {
    if (item.type === 'seq') {
      seqBuf.push(item.node!)
      continue
    }
    flush()
    const layer = item.nodes!
    const tailNodes = item.tail!
    const tailStr = tailNodes.join(' → ')
    const n = layer.length
    const mid = Math.floor(n / 2)
    const maxLen = Math.max(...layer.map((name) => name.length))

    for (let k = 0; k < n; k++) {
      const node = layer[k]
      const padW = maxLen - node.length + 1
      let prefix: string, fill: string, bracket: string

      if (k === 0) {
        prefix = '├─ '
        fill = '─'.repeat(padW)
        bracket = '─┐'
      } else if (k === n - 1) {
        prefix = '└─ '
        fill = '─'.repeat(padW)
        bracket = '─┘'
      } else if (k === mid && tailStr) {
        prefix = '├─ '
        fill = ' '.repeat(padW)
        bracket = '─┤  ' + tailStr
      } else {
        prefix = '├─ '
        fill = ' '.repeat(padW)
        bracket = ' │'
      }
      result.push(`${prefix}${node}${fill}${bracket}`)
    }
  }
  flush()
  return result
}

/* ── Parallel group detection ─────────────────────────────────────── */

function findParallelMembers(edgeMap: Record<string, string[]>): Set<string> {
  const reverse: Record<string, string[]> = {}
  for (const [src, dests] of Object.entries(edgeMap)) {
    for (const dst of dests) {
      if (!reverse[dst]) reverse[dst] = []
      reverse[dst].push(src)
    }
  }
  const members = new Set<string>()
  for (const [, srcs] of Object.entries(reverse)) {
    if (srcs.length >= 2) {
      for (const s of srcs) members.add(s)
    }
  }
  return members
}

/* ── Step icon/label matching CLI exactly ─────────────────────────── */

// CLI color constants — matches _STATUS_STYLE and icon colors in cmd_show.py exactly
const C_GREEN   = '#22c55e'
const C_AMBER   = '#f59e0b'
const C_RED     = '#ef4444'
const C_MAGENTA = '#d946ef'

interface StepDisplay {
  icon: string
  iconColor: string
  label: string
  labelColor: string
  warnSuffix?: boolean  // "(warnings)" dim suffix
}

function getStepDisplay(event: NodeEvent): StepDisplay {
  const insp = event.inspection
  const hasWarnings =
    event.status === 'pass' &&
    insp !== null &&
    (
      (insp.empty_fields?.length ?? 0) > 0 ||
      (insp.type_mismatches?.length ?? 0) > 0 ||
      (insp.unannotated_successors?.length ?? 0) > 0 ||
      (insp.suspicious_empty_keys?.length ?? 0) > 0 ||
      ((insp.tool_failures?.length ?? 0) > 0 && !insp.has_tool_failure)
    )

  if (event.status === 'pass' && hasWarnings) {
    return { icon: '~', iconColor: C_AMBER, label: 'pass', labelColor: C_GREEN, warnSuffix: true }
  }
  if (event.status === 'pass') {
    return { icon: '✓', iconColor: C_GREEN, label: 'pass', labelColor: C_GREEN }
  }
  if (event.status === 'fail') {
    return { icon: '⚠', iconColor: C_AMBER, label: 'silent failure', labelColor: C_AMBER }
  }
  if (event.status === 'semantic_fail') {
    return { icon: '⊗', iconColor: C_MAGENTA, label: 'semantic fail', labelColor: C_MAGENTA }
  }
  if (event.status === 'interrupted') {
    return { icon: '⏸', iconColor: C_AMBER, label: 'interrupted', labelColor: C_AMBER }
  }
  return { icon: '✗', iconColor: C_RED, label: 'crashed', labelColor: C_RED }
}

function successorName(event: NodeEvent, run: RunRecord): string {
  const succs = run.graph_edge_map?.[event.node_name] ?? []
  return succs[0] ?? 'next node'
}

/* ── Detail lines (matching CLI └─ format) ────────────────────────── */

// Detail line uses inline color to match CLI exactly
interface DetailLine {
  text: string
  color?: string     // hex color
  italic?: boolean
  underline?: boolean
  bold?: boolean
  indent?: boolean   // leading spaces — render without the └─ prefix
}

function dl(text: string, opts: Omit<DetailLine, 'text'> = {}): DetailLine {
  return { text, ...opts }
}

function getDetailLines(event: NodeEvent, run: RunRecord): DetailLine[] {
  const lines: DetailLine[] = []
  const insp = event.inspection
  const display = getStepDisplay(event)

  // Failure type tags (underlined, amber — matches CLI yellow underline)
  if (event.status === 'fail' && insp) {
    if (insp.is_silent_failure) {
      lines.push(dl('context error', { color: C_AMBER, underline: true }))
    }
    if (insp.has_tool_failure) {
      lines.push(dl('tool failure', { color: C_AMBER, underline: true }))
    }
  }

  // Interrupted
  if (event.status === 'interrupted') {
    lines.push(dl('execution paused — awaiting human approval', { color: '#52525e', italic: true }))
    return lines
  }

  // Semantic fail — show validators (magenta, matching CLI bold magenta)
  if (event.status === 'semantic_fail') {
    for (const vr of event.validator_results) {
      if (!vr.is_valid) {
        lines.push(dl(`⊗ ${vr.validator_name}  ${vr.message}`, { color: C_MAGENTA }))
      }
    }
    return lines
  }

  // Clean pass — show passing validators (dim green)
  if (event.status === 'pass' && !display.warnSuffix) {
    const passing = event.validator_results.filter((v) => v.is_valid)
    for (const vr of passing) {
      lines.push(dl(`✓ ${vr.validator_name}`, { color: '#1a6b35' }))
    }
    return lines
  }

  // Pass with warnings (dim lines matching CLI dim style)
  if (event.status === 'pass' && display.warnSuffix) {
    const successor = successorName(event, run)
    if (insp?.empty_fields) {
      for (const field of insp.empty_fields) {
        lines.push(dl(`Field "${field}" is empty`, { color: '#52525e' }))
      }
      lines.push(dl(`${successor} may receive degraded state`, { color: '#52525e' }))
    }
    if (insp?.type_mismatches) {
      for (const m of insp.type_mismatches) {
        lines.push(dl(`Field "${m.field_name}" expected ${m.expected_type}, got ${m.actual_type}`, { color: '#52525e' }))
      }
    }
    if (insp?.unannotated_successors?.length) {
      const names = insp.unannotated_successors.join(', ')
      lines.push(dl(`silent-failure detection skipped — add type hints to: ${names}`, { color: '#52525e' }))
    }
    if (insp?.suspicious_empty_keys) {
      for (const key of insp.suspicious_empty_keys) {
        lines.push(dl(`Output key "${key}" is empty (may degrade downstream)`, { color: '#52525e' }))
      }
    }
    if (insp?.tool_failures) {
      for (const tf of insp.tool_failures) {
        const tfIcon = tf.severity === 'critical' ? '⚠' : '~'
        lines.push(dl(`${tfIcon} Tool ${tf.failure_type}: field "${tf.field_name}" — ${tf.evidence}`, { color: tf.severity === 'critical' ? C_RED : C_AMBER }))
      }
    }
    return lines
  }

  // Crash / fail details
  const successor = successorName(event, run)
  const isDownstream =
    event.status === 'fail' &&
    run.first_failure_step !== null &&
    event.node_name !== run.first_failure_step

  if (event.exception) {
    lines.push(dl('exception', { color: '#52525e' }))
    const firstLine = event.exception.split('\n').find((l) => l.trim()) ?? ''
    lines.push(dl(firstLine, { color: '#e4e4e8', italic: true, indent: true }))

    const locMatch = event.exception.match(/File ".*?([^/\\]+\.py)", line (\d+)/)
    if (locMatch) {
      const codeLines = event.exception.split('\n')
      const fileIdx = codeLines.findIndex((l) => l.includes(locMatch[0]))
      const codeLine = fileIdx >= 0 && fileIdx + 1 < codeLines.length ? codeLines[fileIdx + 1].trim() : ''
      if (codeLine) {
        lines.push(dl(`at ${locMatch[1]}:${locMatch[2]}  →  ${codeLine}`, { color: '#71717a', italic: true, indent: true }))
      }
    }
  }

  if (insp?.tool_failures?.length) {
    lines.push(dl('tool failures', { color: '#52525e' }))
    for (const tf of insp.tool_failures) {
      const tfIcon = tf.severity === 'critical' ? '⚠' : '~'
      lines.push(dl(`${tfIcon} Tool ${tf.failure_type}: field "${tf.field_name}" — ${tf.evidence}`, { color: tf.severity === 'critical' ? C_RED : C_AMBER, indent: true }))
    }
  }

  if (insp) {
    if (insp.missing_fields?.length) {
      lines.push(dl('missing fields', { color: '#52525e' }))
      for (const field of insp.missing_fields) {
        lines.push(dl(`Field "${field}" is missing`, { color: '#e4e4e8', italic: true, indent: true }))
      }
      lines.push(dl(`${successor} received bad state`, { color: '#52525e', italic: true, indent: true }))
    } else if (insp.empty_fields?.length) {
      lines.push(dl('missing fields', { color: '#52525e' }))
      for (const field of insp.empty_fields) {
        lines.push(dl(`Field "${field}" is empty`, { color: '#e4e4e8', italic: true, indent: true }))
      }
      lines.push(dl(`${successor} received bad state`, { color: '#52525e', italic: true, indent: true }))
    } else if (insp.type_mismatches?.length) {
      lines.push(dl('missing fields', { color: '#52525e' }))
      for (const m of insp.type_mismatches) {
        lines.push(dl(`Field "${m.field_name}" expected ${m.expected_type}, got ${m.actual_type}`, { color: '#e4e4e8', italic: true, indent: true }))
      }
    }
  }

  if (isDownstream && run.first_failure_step) {
    lines.push(dl(`Root cause: ${run.first_failure_step}`, { color: C_RED, bold: true }))
  }

  return lines
}

/* ── Replay Button ────────────────────────────────────────────────── */

function ReplayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="ml-2 shrink-0 font-mono text-[11px] opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded"
      style={{ color: '#52525e', border: '1px solid #2a2a30' }}
    >
      ↺ replay from here
    </button>
  )
}

/* ── Step Row Component ───────────────────────────────────────────── */

function StepRow({
  event,
  nameCol,
  run,
  displayIndex,
  onReplay,
}: {
  event: NodeEvent
  nameCol: number
  run: RunRecord
  displayIndex?: number
  onReplay?: (node: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const display = getStepDisplay(event)
  const details = getDetailLines(event, run)
  const number = (displayIndex ?? event.step_index) + 1

  return (
    <div className="group">
      {/* Main row — matches CLI: "  1  node_name    42 ms   ✓  pass" */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left font-mono text-[13px] leading-[34px] flex items-baseline gap-0 px-4 hover:bg-white/[0.025] transition-colors"
      >
        <span className="text-[#35353e] w-8 text-right shrink-0 tabular-nums">{number}</span>
        <span className="w-3 shrink-0" />
        <span className="text-[var(--text-primary)] font-semibold shrink-0">{event.node_name}</span>
        <span className="shrink-0" style={{ width: `${Math.max(0, (nameCol - event.node_name.length)) * 0.55 + 1}em` }} />
        <span className="text-[#52525e] italic w-[5.5em] text-right shrink-0 tabular-nums">{formatDur(event.duration_ms)}</span>
        <span className="w-4 shrink-0" />
        <span style={{ color: display.iconColor }} className="shrink-0 w-4 text-center">{display.icon}</span>
        <span className="w-2 shrink-0" />
        <span style={{ color: display.labelColor }} className="font-bold">
          {display.label}
          {display.warnSuffix && <span style={{ color: '#78716c', fontWeight: 400 }}> (warnings)</span>}
        </span>
        {/* Expand indicator */}
        <span className="ml-auto text-[10px] text-[#2a2a30] group-hover:text-[#52525e] transition-colors">
          {expanded ? '▾' : '▸'}
        </span>
        {onReplay && !SENTINEL_NODES.has(event.node_name) && (
          <ReplayButton onClick={() => onReplay(event.node_name)} />
        )}
      </button>

      {/* Detail └─ lines — matches CLI indent/color exactly */}
      {details.length > 0 && (
        <div className="font-mono text-[12px] leading-6 pl-4">
          {details.map((line, i) => (
            <div key={i} className="flex items-baseline">
              <span className="w-8 shrink-0" />
              <span className="w-3 shrink-0" />
              <span className="shrink-0 mr-2" style={{ color: '#35353e' }}>
                {line.indent ? '   ' : '└─'}
              </span>
              <span
                style={{
                  color: line.color ?? '#52525e',
                  fontStyle: line.italic ? 'italic' : undefined,
                  textDecoration: line.underline ? 'underline' : undefined,
                  fontWeight: line.bold ? 700 : undefined,
                }}
              >
                {line.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Expanded: input/output (web enhancement over CLI) */}
      {expanded && (
        <div
          className="mx-4 mb-3 mt-1 rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {event.input_state !== null && (
              <div className="p-3" style={{ borderRight: '1px solid var(--border-default)' }}>
                <div className="text-[10px] uppercase tracking-widest font-semibold text-[#52525e] mb-2">Input</div>
                <JsonViewer data={event.input_state} defaultCollapsed={true} />
              </div>
            )}
            {event.output_dict !== null && (
              <div className="p-3">
                <div className="text-[10px] uppercase tracking-widest font-semibold text-[#52525e] mb-2">Output</div>
                <JsonViewer data={event.output_dict} defaultCollapsed={true} />
              </div>
            )}
          </div>
          {event.exception && (
            <div className="p-3" style={{ borderTop: '1px solid var(--border-default)' }}>
              <div className="text-[10px] uppercase tracking-widest font-semibold text-red-400 mb-2">Full Exception</div>
              <pre className="text-[11px] text-red-200 bg-red-950/20 border border-red-800/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-5 font-mono">
                {event.exception}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Parallel Group Panel ─────────────────────────────────────────── */

function ParallelGroup({
  events,
  nameCol,
  run,
  onReplay,
}: {
  events: NodeEvent[]
  nameCol: number
  run: RunRecord
  onReplay?: (node: string) => void
}) {
  const nodeNames = events.map((e) => e.node_name).join(' · ')
  return (
    <div
      className="mx-3 my-2 rounded-lg overflow-hidden"
      style={{ border: '1px solid rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.03)' }}
    >
      <div className="px-4 py-1.5 text-[11px] font-mono" style={{ borderBottom: '1px solid rgba(59,130,246,0.15)' }}>
        <span className="text-blue-400 font-bold">⟼ parallel</span>
        <span className="text-[#52525e] ml-3">{nodeNames}</span>
      </div>
      {events.map((event, i) => (
        <StepRow key={i} event={event} nameCol={nameCol} run={run} onReplay={onReplay} />
      ))}
    </div>
  )
}

/* ── Cycle Group Panel ────────────────────────────────────────────── */

function CycleGroup({
  iterations,
  nameCol,
  run,
  onReplay,
}: {
  iterations: NodeEvent[][]
  nameCol: number
  run: RunRecord
  onReplay?: (node: string) => void
}) {
  const cycleNodeNames = iterations[0]?.map((e) => e.node_name).join(' → ') ?? ''
  return (
    <div
      className="mx-3 my-2 rounded-lg overflow-hidden"
      style={{ border: '1px solid rgba(6,182,212,0.25)', background: 'rgba(6,182,212,0.03)' }}
    >
      <div className="px-4 py-1.5 text-[11px] font-mono" style={{ borderBottom: '1px solid rgba(6,182,212,0.15)' }}>
        <span className="text-cyan-400 font-bold">↩ cycle</span>
        <span className="text-[#52525e] ml-3">{cycleNodeNames}</span>
        <span className="text-cyan-400 font-bold ml-3">×{iterations.length}</span>
      </div>
      {iterations.map((iterEvents, idx) => (
        <div key={idx}>
          {idx > 0 && (
            <div className="mx-4 border-t" style={{ borderColor: 'rgba(6,182,212,0.12)' }} />
          )}
          <div className="px-4 py-1 text-[11px] font-mono text-cyan-400/60">
            iteration {idx + 1}
          </div>
          {iterEvents.map((event, i) => (
            <StepRow key={i} event={event} nameCol={nameCol} run={run} onReplay={onReplay} />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ── Segment Events (port of CLI _segment_events) ─────────────────── */

type Segment =
  | { type: 'normal'; events: NodeEvent[] }
  | { type: 'parallel'; events: NodeEvent[] }
  | { type: 'cycle'; iterations: NodeEvent[][] }

function segmentEvents(events: NodeEvent[], edgeMap?: Record<string, string[]>): Segment[] {
  const counts = new Map<string, number>()
  for (const e of events) counts.set(e.node_name, (counts.get(e.node_name) ?? 0) + 1)
  const cyclicNames = new Set<string>()
  counts.forEach((c, name) => {
    if (c > 1) cyclicNames.add(name)
  })

  const parallelMembers = edgeMap ? findParallelMembers(edgeMap) : new Set<string>()

  if (cyclicNames.size === 0 && parallelMembers.size === 0) {
    return [{ type: 'normal', events }]
  }

  // Cycle grouping takes priority
  if (cyclicNames.size > 0) {
    const cycleIndices = events.map((e, i) => cyclicNames.has(e.node_name) ? i : -1).filter((i) => i >= 0)
    const cycleStart = cycleIndices[0]
    const cycleEnd = cycleIndices[cycleIndices.length - 1] + 1

    const segments: Segment[] = []
    if (cycleStart > 0) segments.push({ type: 'normal', events: events.slice(0, cycleStart) })

    const cycleBlock = events.slice(cycleStart, cycleEnd)
    const iterations = new Map<number, NodeEvent[]>()
    for (const e of cycleBlock) {
      if (!iterations.has(e.attempt_index)) iterations.set(e.attempt_index, [])
      iterations.get(e.attempt_index)!.push(e)
    }
    const sortedIters = Array.from(iterations.entries()).sort(([a], [b]) => a - b).map(([, evts]) => evts)
    segments.push({ type: 'cycle', iterations: sortedIters })

    if (cycleEnd < events.length) segments.push({ type: 'normal', events: events.slice(cycleEnd) })
    return segments
  }

  // Parallel segmentation
  const segments: Segment[] = []
  let normalBuf: NodeEvent[] = []
  let parallelBuf: NodeEvent[] = []

  for (const event of events) {
    if (parallelMembers.has(event.node_name)) {
      parallelBuf.push(event)
    } else {
      if (parallelBuf.length > 0) {
        if (normalBuf.length > 0) { segments.push({ type: 'normal', events: normalBuf }); normalBuf = [] }
        segments.push({ type: 'parallel', events: parallelBuf }); parallelBuf = []
      }
      normalBuf.push(event)
    }
  }
  if (parallelBuf.length > 0) {
    if (normalBuf.length > 0) { segments.push({ type: 'normal', events: normalBuf }); normalBuf = [] }
    segments.push({ type: 'parallel', events: parallelBuf })
  }
  if (normalBuf.length > 0) segments.push({ type: 'normal', events: normalBuf })

  return segments
}

/* ── Metrics Panel ───────────────────────────────────────────────── */

function MetricsPanel({ run }: { run: RunRecord }) {
  const steps = run.steps ?? []
  const totalNodes = steps.length
  const passedNodes = steps.filter((s) => s.status === 'pass').length
  const failedNodes = steps.filter((s) => s.status !== 'pass').length
  const successRate = totalNodes > 0 ? Math.round((passedNodes / totalNodes) * 100) : null

  // Failure breakdown
  const toolFailures = steps.filter((s) => s.inspection?.has_tool_failure).length
  const contextFailures = steps.filter(
    (s) => s.status === 'fail' && s.inspection?.is_silent_failure,
  ).length
  const semanticFailures = steps.filter((s) => s.status === 'semantic_fail').length
  const crashes = steps.filter((s) => s.status === 'crashed').length

  // Worst severity
  const severityOrder = ['critical', 'warning', 'info', 'ok']
  const worstSeverity = steps.reduce((worst, s) => {
    const sev = s.inspection?.severity
    if (!sev) return worst
    return severityOrder.indexOf(sev) < severityOrder.indexOf(worst) ? sev : worst
  }, 'ok' as string)

  // LLM metrics
  const totalLLMCalls = run.total_llm_calls ?? 0
  const totalTokens = run.total_tokens ?? 0
  const totalCost = run.total_cost_usd ?? null
  const hasLLMData = totalLLMCalls > 0 || totalTokens > 0

  // Per-node cost breakdown
  const nodeCosts = steps
    .filter((s) => s.llm_usage?.total_cost_usd != null && s.llm_usage.total_cost_usd > 0)
    .map((s) => ({
      name: s.node_name,
      cost: s.llm_usage!.total_cost_usd!,
      tokens: s.llm_usage!.total_tokens,
      calls: s.llm_usage!.calls.length,
    }))
    .sort((a, b) => b.cost - a.cost)

  const completed = run.completed_at != null

  const severityColor: Record<string, string> = {
    critical: C_RED,
    warning: C_AMBER,
    info: '#3b82f6',
    ok: C_GREEN,
  }

  function fmtCost(usd: number): string {
    if (usd < 0.01) return `$${usd.toFixed(4)}`
    return `$${usd.toFixed(2)}`
  }

  function fmtTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return `${n}`
  }

  return (
    <div
      className="mt-4 rounded-xl overflow-hidden"
      style={{
        border: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.03) inset',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2 flex items-center gap-2"
        style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}
      >
        <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-secondary)]">Metrics</span>
      </div>

      <div className="p-4 font-mono text-[12px]">
        {/* ── Execution section ─────────────────────────────── */}
        <div className="text-[10px] uppercase tracking-widest font-semibold text-[#52525e] mb-2">Execution</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-1.5 mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-[#52525e]">completed</span>
            <span style={{ color: completed ? C_GREEN : C_AMBER, fontWeight: 700 }}>
              {completed ? 'yes' : 'no'}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-[#52525e]">duration</span>
            <span className="text-[var(--text-primary)]">{formatDur(run.duration_ms)}</span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-[#52525e]">success rate</span>
            <span style={{ color: successRate === 100 ? C_GREEN : successRate === null ? '#52525e' : C_AMBER }}>
              {successRate !== null ? `${passedNodes}/${totalNodes} (${successRate}%)` : '—'}
            </span>
          </div>
        </div>

        {/* ── Failures section ──────────────────────────────── */}
        <div className="text-[10px] uppercase tracking-widest font-semibold text-[#52525e] mb-2">Failures</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-1.5 mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-[#52525e]">total</span>
            <span style={{ color: failedNodes > 0 ? C_RED : C_GREEN, fontWeight: 700 }}>
              {failedNodes}
            </span>
          </div>

          {failedNodes > 0 && (
            <div className="flex items-baseline gap-2 col-span-2">
              <span className="text-[#52525e]">types</span>
              <span className="text-[#71717a]">
                {[
                  toolFailures > 0 && `tool: ${toolFailures}`,
                  contextFailures > 0 && `context: ${contextFailures}`,
                  semanticFailures > 0 && `semantic: ${semanticFailures}`,
                  crashes > 0 && `crash: ${crashes}`,
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
              </span>
            </div>
          )}

          {run.first_failure_step && (
            <div className="flex items-baseline gap-2">
              <span className="text-[#52525e]">first failure</span>
              <span style={{ color: C_RED, fontWeight: 700 }}>{run.first_failure_step}</span>
            </div>
          )}

          <div className="flex items-baseline gap-2">
            <span className="text-[#52525e]">severity</span>
            <span style={{ color: severityColor[worstSeverity] ?? '#52525e', fontWeight: 700 }}>
              {worstSeverity}
            </span>
          </div>
        </div>

        {/* ── LLM section — only if data exists ─────────────── */}
        {hasLLMData && (
          <>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-[#52525e] mb-2">LLM Usage</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[#52525e]">calls</span>
                <span className="text-[var(--text-primary)]">{totalLLMCalls}</span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-[#52525e]">tokens</span>
                <span className="text-[var(--text-primary)]">{fmtTokens(totalTokens)}</span>
              </div>

              {totalCost !== null && (
                <div className="flex items-baseline gap-2">
                  <span className="text-[#52525e]">cost</span>
                  <span style={{ color: C_GREEN, fontWeight: 700 }}>{fmtCost(totalCost)}</span>
                </div>
              )}
            </div>

            {/* Per-node cost breakdown */}
            {nodeCosts.length >= 2 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-default)' }}>
                <div className="text-[10px] uppercase tracking-widest font-semibold text-[#52525e] mb-1.5">Per-Node Cost</div>
                <div className="text-[11px]">
                  {nodeCosts.map((nc, i) => (
                    <div key={i} className="flex items-baseline gap-0 leading-5">
                      <span className="text-[#52525e] w-[140px] truncate shrink-0">{nc.name}</span>
                      <span className="text-[#71717a] w-[60px] text-right shrink-0">{fmtCost(nc.cost)}</span>
                      <span className="text-[#3a3a40] ml-3">{fmtTokens(nc.tokens)} tok · {nc.calls} call{nc.calls !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ── Main Component ───────────────────────────────────────────────── */

export default function CliRunView({ run }: { run: RunRecord }) {
  const steps = run.steps ?? []
  const nameCol = steps.length > 0 ? Math.max(...steps.map((e) => e.node_name.length)) + 2 : 10
  const displayNodes = (run.graph_node_names ?? []).filter((n) => !SENTINEL_NODES.has(n))
  const topo = displayNodes.length > 1 ? topologyLines(run.graph_edge_map ?? {}, run.graph_node_names ?? []) : []
  const segments = segmentEvents(steps, run.graph_edge_map)

  const statusInfo = STATUS_DOT[run.overall_status] ?? { dot: '●', color: '#52525e' }
  const statusLabelClass = STATUS_LABEL_STYLE[run.overall_status] ?? 'text-[#52525e]'

  const router = useRouter()
  const [replayState, setReplayState] = useState<ReplayState>({ phase: 'idle' })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [appFactory, setAppFactory] = useState('')
  const [factorySaved, setFactorySaved] = useState(false)
  const factoryInputRef = useRef<HTMLInputElement>(null)

  // Load saved factory from server config on mount
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d: { app?: string }) => { if (d.app) setAppFactory(d.app) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function saveFactory(value: string) {
    if (!value.trim()) return
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: value.trim() }),
    }).catch(() => {})
    setFactorySaved(true)
    setTimeout(() => setFactorySaved(false), 1500)
  }

  async function handleReplay(nodeName: string) {
    if (pollRef.current) clearInterval(pollRef.current)
    setReplayState({ phase: 'submitting' })

    let resp: Response
    try {
      resp = await fetch('/api/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: run.run_id, from_step: nodeName }),
      })
    } catch {
      setReplayState({ phase: 'error', message: 'Network error' })
      return
    }

    if (resp.status === 422) {
      setReplayState({ phase: 'no_factory' })
      setTimeout(() => factoryInputRef.current?.focus(), 50)
      return
    }
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}))
      setReplayState({ phase: 'error', message: (body as { error?: string }).error ?? `HTTP ${resp.status}` })
      return
    }

    const { job_id } = await resp.json() as { job_id: string }
    setReplayState({ phase: 'polling', jobId: job_id })

    const deadline = Date.now() + 5 * 60 * 1000 // 5-minute timeout
    pollRef.current = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(pollRef.current!)
        setReplayState({ phase: 'error', message: 'Timed out waiting for replay' })
        return
      }
      try {
        const pr = await fetch(`/api/replay/status/${job_id}`)
        const pdata = await pr.json() as { status: string; run_id?: string; message?: string }
        if (pdata.status === 'done') {
          clearInterval(pollRef.current!)
          setReplayState({ phase: 'done', newRunId: pdata.run_id })
          router.push(`/compare?a=${run.run_id}&b=${pdata.run_id}`)
        } else if (pdata.status === 'error') {
          clearInterval(pollRef.current!)
          setReplayState({ phase: 'error', message: pdata.message ?? 'Replay failed' })
        }
      } catch {
        // transient network hiccup — keep polling
      }
    }, 2000)
  }

  let globalIdx = 0

  return (
    <div className="max-w-5xl">
      {/* Back nav */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs transition-colors text-[#52525e] hover:text-[#8a8a96]"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M6.5 2L3.5 5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          All runs
        </Link>
      </div>

      {/* ── Terminal frame ─────────────────────────────────────────── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: '1px solid var(--border-default)',
          background: 'var(--bg-surface)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.03) inset',
        }}
      >
        {/* Terminal titlebar */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3a3a40' }} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3a3a40' }} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3a3a40' }} />
            </div>
            <span className="text-xs font-mono text-[var(--text-secondary)]">argus show {run.run_id.slice(0, 12)}…</span>
          </div>
          <div className="flex items-center gap-2">
            {/* App factory input */}
            <form
              onSubmit={(e) => { e.preventDefault(); saveFactory(appFactory) }}
              className="flex items-center gap-1"
            >
              <input
                ref={factoryInputRef}
                type="text"
                value={appFactory}
                onChange={(e) => setAppFactory(e.target.value)}
                onBlur={() => { if (appFactory.trim()) saveFactory(appFactory) }}
                placeholder="module:build_graph"
                className="font-mono text-[10px] px-2 py-1 rounded-md outline-none w-[160px] transition-colors"
                style={{
                  background: 'var(--bg-surface)',
                  border: `1px solid ${replayState.phase === 'no_factory' ? '#f59e0b' : 'var(--border-default)'}`,
                  color: appFactory ? 'var(--text-primary)' : '#3a3a40',
                }}
              />
              {factorySaved && (
                <span className="text-[10px] font-mono text-green-400">saved</span>
              )}
            </form>
            <Link
              href={`/compare?a=${run.run_id}`}
              className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md transition-colors hover:text-white font-mono"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}
            >
              compare
            </Link>
          </div>
        </div>

        {/* ── Replay status banner ───────────────────────────────── */}
        {replayState.phase !== 'idle' && (
          <div
            className="px-4 py-1.5 font-mono text-[12px] flex items-center gap-2"
            style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}
          >
            {replayState.phase === 'submitting' && (
              <span style={{ color: '#f59e0b' }}>↺ submitting replay…</span>
            )}
            {replayState.phase === 'polling' && (
              <span style={{ color: '#f59e0b' }}>
                ↺ replay running
                <span className="animate-pulse">…</span>
              </span>
            )}
            {replayState.phase === 'done' && (
              <>
                <span style={{ color: '#22c55e' }}>✓ replay complete</span>
                {replayState.newRunId && (
                  <a
                    href={`/runs/${replayState.newRunId}`}
                    className="ml-2 hover:underline"
                    style={{ color: '#22c55e' }}
                  >
                    → view run
                  </a>
                )}
              </>
            )}
            {replayState.phase === 'error' && (
              <span style={{ color: '#ef4444' }}>✗ replay failed: {replayState.message}</span>
            )}
            {replayState.phase === 'no_factory' && (
              <span style={{ color: '#f59e0b', fontStyle: 'italic' }}>
                enter your app factory above (e.g. module:build_graph)
              </span>
            )}
          </div>
        )}

        {/* ── Content: CLI mirror ────────────────────────────────── */}
        <div className="py-4 font-mono text-[13px]">

          {/* Header: argus  <run_id>  ·  <started>  ·  <duration> */}
          <div className="px-4 leading-7">
            <span className="text-[var(--text-primary)] font-bold italic">argus</span>
            <span className="text-[#52525e] italic ml-2">
              {run.run_id}  ·  {formatTimestamp(run.started_at)}  ·  {formatDur(run.duration_ms)}
            </span>
          </div>

          {/* Status: status  ●  <status> */}
          <div className="px-4 leading-7 flex items-center gap-0">
            <span className="text-[#52525e] mr-4">status</span>
            <span style={{ color: statusInfo.color }} className="mr-2 text-base">{statusInfo.dot}</span>
            <span className={statusLabelClass}>{run.overall_status}</span>
          </div>

          {/* Replay info */}
          {run.parent_run_id && (
            <div className="px-4 leading-7">
              <span className="text-[#52525e] italic">replay of</span>
              <a href={`/runs/${run.parent_run_id}`} className="text-[#52525e] hover:text-blue-400 transition-colors ml-2">
                {run.parent_run_id}
              </a>
              {run.replay_from_step && (
                <>
                  <span className="text-[#52525e] italic ml-2">from</span>
                  <span className="text-[var(--text-primary)] font-bold ml-2">{run.replay_from_step}</span>
                </>
              )}
            </div>
          )}

          {/* Argus version + step count */}
          <div className="px-4 leading-7 text-[#35353e] text-[11px]">
            v{run.argus_version}  ·  {steps.length} step{steps.length !== 1 ? 's' : ''}
            {run.is_cyclic && <span className="text-purple-400 ml-3">cyclic</span>}
          </div>

          {/* ── Separator ──────────────────────────────────────── */}
          <div className="my-3 mx-4 border-t" style={{ borderColor: 'var(--border-default)' }} />

          {/* ── Graph topology ─────────────────────────────────── */}
          {topo.length > 0 && (
            <>
              <div className="px-4 leading-6 text-[#52525e] text-[12px] mb-1">graph</div>
              <div className="px-4 mb-1">
                {topo.map((line, i) => (
                  <div key={i} className="text-[#52525e] text-[12px] leading-6 whitespace-pre">{line}</div>
                ))}
              </div>
              <div className="my-3 mx-4 border-t" style={{ borderColor: 'var(--border-default)' }} />
            </>
          )}

          {/* ── Node steps ─────────────────────────────────────── */}
          {segments.map((seg, si) => {
            if (seg.type === 'normal') {
              const rows = seg.events.map((event) => {
                const idx = globalIdx++
                return <StepRow key={idx} event={event} nameCol={nameCol} run={run} displayIndex={idx} onReplay={handleReplay} />
              })
              return <div key={si}>{rows}</div>
            }
            if (seg.type === 'parallel') {
              const startIdx = globalIdx
              globalIdx += seg.events.length
              return <ParallelGroup key={si} events={seg.events} nameCol={nameCol} run={run} onReplay={handleReplay} />
            }
            // cycle
            const startIdx = globalIdx
            for (const iter of seg.iterations) globalIdx += iter.length
            return <CycleGroup key={si} iterations={seg.iterations} nameCol={nameCol} run={run} onReplay={handleReplay} />
          })}

          {/* ── Root cause chain ───────────────────────────────── */}
          {run.root_cause_chain && run.root_cause_chain.length > 0 && (
            <>
              <div className="my-3 mx-4 border-t" style={{ borderColor: 'var(--border-default)' }} />
              <div className="px-4 leading-7 flex items-baseline gap-0">
                <span className="text-[#52525e] italic mr-4">root cause</span>
                <span className="text-red-400 font-bold">
                  {run.root_cause_chain.join('  →  ')}
                </span>
              </div>
            </>
          )}

          {/* Bottom spacing */}
          <div className="h-2" />
        </div>
      </div>

      {/* ── Metrics panel (below terminal) ─────────────────────────── */}
      <MetricsPanel run={run} />

      {/* ── Initial State (below terminal) ─────────────────────────── */}
      {run.initial_state && Object.keys(run.initial_state).length > 0 && (
        <div className="mt-6">
          <h2 className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-secondary)] mb-2">
            Initial State
          </h2>
          <JsonViewer data={run.initial_state} defaultCollapsed={true} />
        </div>
      )}
    </div>
  )
}
