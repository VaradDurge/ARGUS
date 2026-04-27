'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { RunRecord, NodeEvent, ValidatorResult } from '@/lib/types'
import JsonViewer from './JsonViewer'

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

interface StepDisplay {
  icon: string
  iconColor: string
  label: string
  labelClass: string
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
    return { icon: '~', iconColor: '#f59e0b', label: 'pass (warnings)', labelClass: 'text-green-400' }
  }
  if (event.status === 'pass') {
    return { icon: '✓', iconColor: '#22c55e', label: 'pass', labelClass: 'text-green-400' }
  }
  if (event.status === 'fail') {
    return { icon: '⚠', iconColor: '#f59e0b', label: 'silent failure', labelClass: 'text-amber-400' }
  }
  if (event.status === 'semantic_fail') {
    return { icon: '⊗', iconColor: '#d946ef', label: 'semantic fail', labelClass: 'text-purple-400' }
  }
  if (event.status === 'interrupted') {
    return { icon: '⏸', iconColor: '#f59e0b', label: 'interrupted', labelClass: 'text-amber-400' }
  }
  return { icon: '✗', iconColor: '#ef4444', label: 'crashed', labelClass: 'text-red-400' }
}

function successorName(event: NodeEvent, run: RunRecord): string {
  const succs = run.graph_edge_map?.[event.node_name] ?? []
  return succs[0] ?? 'next node'
}

/* ── Detail lines (matching CLI └─ format) ────────────────────────── */

interface DetailLine {
  text: string
  style?: string
  bold?: boolean
}

function getDetailLines(event: NodeEvent, run: RunRecord): DetailLine[] {
  const lines: DetailLine[] = []
  const insp = event.inspection
  const display = getStepDisplay(event)

  // Failure type tags
  if (event.status === 'fail' && insp) {
    if (insp.is_silent_failure) {
      lines.push({ text: 'context error', style: 'text-amber-400 underline' })
    }
    if (insp.has_tool_failure) {
      lines.push({ text: 'tool failure', style: 'text-amber-400 underline' })
    }
  }

  // Interrupted
  if (event.status === 'interrupted') {
    lines.push({ text: 'execution paused — awaiting human approval', style: 'text-[#52525e] italic' })
    return lines
  }

  // Semantic fail — show validators
  if (event.status === 'semantic_fail') {
    for (const vr of event.validator_results) {
      if (!vr.is_valid) {
        lines.push({ text: `⊗ ${vr.validator_name}  ${vr.message}`, style: 'text-purple-400' })
      }
    }
    return lines
  }

  // Clean pass — show passing validators
  if (event.status === 'pass' && display.label === 'pass') {
    const passing = event.validator_results.filter((v) => v.is_valid)
    for (const vr of passing) {
      lines.push({ text: `✓ ${vr.validator_name}`, style: 'text-green-400/60' })
    }
    return lines
  }

  // Pass with warnings
  if (event.status === 'pass' && display.label === 'pass (warnings)') {
    const successor = successorName(event, run)
    if (insp?.empty_fields) {
      for (const field of insp.empty_fields) {
        lines.push({ text: `Field "${field}" is empty`, style: 'text-[#52525e]' })
      }
      lines.push({ text: `${successor} may receive degraded state`, style: 'text-[#52525e]' })
    }
    if (insp?.type_mismatches) {
      for (const m of insp.type_mismatches) {
        lines.push({ text: `Field "${m.field_name}" expected ${m.expected_type}, got ${m.actual_type}`, style: 'text-[#52525e]' })
      }
    }
    if (insp?.unannotated_successors?.length) {
      const names = insp.unannotated_successors.join(', ')
      lines.push({ text: `silent-failure detection skipped — add type hints to: ${names}`, style: 'text-[#52525e]' })
    }
    if (insp?.suspicious_empty_keys) {
      for (const key of insp.suspicious_empty_keys) {
        lines.push({ text: `Output key "${key}" is empty (may degrade downstream)`, style: 'text-[#52525e]' })
      }
    }
    if (insp?.tool_failures) {
      for (const tf of insp.tool_failures) {
        const tfIcon = tf.severity === 'critical' ? '⚠' : '~'
        lines.push({ text: `${tfIcon} Tool ${tf.failure_type}: field "${tf.field_name}" — ${tf.evidence}`, style: tf.severity === 'critical' ? 'text-red-400' : 'text-amber-400' })
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
    lines.push({ text: 'exception', style: 'text-[#52525e]' })
    const firstLine = event.exception.split('\n').find((l) => l.trim()) ?? ''
    lines.push({ text: `   ${firstLine}`, style: 'text-[#e4e4e8] italic' })

    // Extract crash location
    const locMatch = event.exception.match(/File ".*?([^/\\]+\.py)", line (\d+)/)
    if (locMatch) {
      const codeLines = event.exception.split('\n')
      const fileIdx = codeLines.findIndex((l) => l.includes(locMatch[0]))
      const codeLine = fileIdx >= 0 && fileIdx + 1 < codeLines.length ? codeLines[fileIdx + 1].trim() : ''
      if (codeLine) {
        lines.push({ text: `   at ${locMatch[1]}:${locMatch[2]}  →  ${codeLine}`, style: 'text-[#52525e] italic' })
      }
    }
  }

  if (insp?.tool_failures?.length) {
    lines.push({ text: 'tool failures', style: 'text-[#52525e]' })
    for (const tf of insp.tool_failures) {
      const tfIcon = tf.severity === 'critical' ? '⚠' : '~'
      lines.push({ text: `   ${tfIcon} Tool ${tf.failure_type}: field "${tf.field_name}" — ${tf.evidence}`, style: tf.severity === 'critical' ? 'text-red-400' : 'text-amber-400' })
    }
  }

  if (insp) {
    if (insp.missing_fields?.length) {
      lines.push({ text: 'missing fields', style: 'text-[#52525e]' })
      for (const field of insp.missing_fields) {
        lines.push({ text: `   Field "${field}" is missing`, style: 'text-[#e4e4e8] italic' })
      }
      lines.push({ text: `   ${successor} received bad state`, style: 'text-[#52525e] italic' })
    } else if (insp.empty_fields?.length) {
      lines.push({ text: 'missing fields', style: 'text-[#52525e]' })
      for (const field of insp.empty_fields) {
        lines.push({ text: `   Field "${field}" is empty`, style: 'text-[#e4e4e8] italic' })
      }
      lines.push({ text: `   ${successor} received bad state`, style: 'text-[#52525e] italic' })
    } else if (insp.type_mismatches?.length) {
      lines.push({ text: 'missing fields', style: 'text-[#52525e]' })
      for (const m of insp.type_mismatches) {
        lines.push({ text: `   Field "${m.field_name}" expected ${m.expected_type}, got ${m.actual_type}`, style: 'text-[#e4e4e8] italic' })
      }
    }
  }

  if (isDownstream && run.first_failure_step) {
    lines.push({ text: `Root cause: ${run.first_failure_step}`, style: 'text-red-400 font-bold' })
  }

  return lines
}

/* ── Step Row Component ───────────────────────────────────────────── */

function StepRow({
  event,
  nameCol,
  run,
  displayIndex,
}: {
  event: NodeEvent
  nameCol: number
  run: RunRecord
  displayIndex?: number
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
        <span className={`${display.labelClass} font-semibold`}>{display.label}</span>
        {/* Expand indicator */}
        <span className="ml-auto text-[10px] text-[#2a2a30] group-hover:text-[#52525e] transition-colors">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {/* Detail └─ lines */}
      {details.length > 0 && (
        <div className="font-mono text-[12px] leading-6 pl-4">
          {details.map((line, i) => (
            <div key={i} className="flex items-baseline">
              <span className="w-8 shrink-0" />
              <span className="w-3 shrink-0" />
              <span className="text-[#35353e] shrink-0 mr-2">
                {line.text.startsWith('   ') ? '   ' : '└─'}
              </span>
              <span className={line.style ?? 'text-[#52525e]'}>
                {line.text.startsWith('   ') ? line.text.slice(3) : line.text}
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
              <pre className="text-[11px] text-red-300/80 bg-red-950/15 border border-red-900/25 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-5 font-mono">
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
}: {
  events: NodeEvent[]
  nameCol: number
  run: RunRecord
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
        <StepRow key={i} event={event} nameCol={nameCol} run={run} />
      ))}
    </div>
  )
}

/* ── Cycle Group Panel ────────────────────────────────────────────── */

function CycleGroup({
  iterations,
  nameCol,
  run,
}: {
  iterations: NodeEvent[][]
  nameCol: number
  run: RunRecord
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
            <StepRow key={i} event={event} nameCol={nameCol} run={run} />
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

/* ── Main Component ───────────────────────────────────────────────── */

export default function CliRunView({ run }: { run: RunRecord }) {
  const steps = run.steps ?? []
  const nameCol = steps.length > 0 ? Math.max(...steps.map((e) => e.node_name.length)) + 2 : 10
  const displayNodes = (run.graph_node_names ?? []).filter((n) => !SENTINEL_NODES.has(n))
  const topo = displayNodes.length > 1 ? topologyLines(run.graph_edge_map ?? {}, run.graph_node_names ?? []) : []
  const segments = segmentEvents(steps, run.graph_edge_map)

  const statusInfo = STATUS_DOT[run.overall_status] ?? { dot: '●', color: '#52525e' }
  const statusLabelClass = STATUS_LABEL_STYLE[run.overall_status] ?? 'text-[#52525e]'

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
          <Link
            href={`/compare?a=${run.run_id}`}
            className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md transition-colors hover:text-white font-mono"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}
          >
            compare
          </Link>
        </div>

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
              <Link href={`/runs/${run.parent_run_id}`} className="text-[#52525e] hover:text-blue-400 transition-colors ml-2">
                {run.parent_run_id}
              </Link>
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
                return <StepRow key={idx} event={event} nameCol={nameCol} run={run} displayIndex={idx} />
              })
              return <div key={si}>{rows}</div>
            }
            if (seg.type === 'parallel') {
              const startIdx = globalIdx
              globalIdx += seg.events.length
              return <ParallelGroup key={si} events={seg.events} nameCol={nameCol} run={run} />
            }
            // cycle
            const startIdx = globalIdx
            for (const iter of seg.iterations) globalIdx += iter.length
            return <CycleGroup key={si} iterations={seg.iterations} nameCol={nameCol} run={run} />
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
