import type { NodeEvent } from './types'
import { SENTINEL_NODES } from './run-utils'

/* ── DAG layer computation ───────────────────────────────────────── */

export function dagLayers(
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

/* ── Topology lines ──────────────────────────────────────────────── */

export interface TopoItem {
  type: 'seq' | 'parallel'
  node?: string
  nodes?: string[]
  tail?: string[]
}

export function topologyLines(
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
  if (layers.length === 0) return [nodes.join(' \u2192 ')]

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
      result.push(seqBuf.join(' \u2192 '))
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
    const tailStr = tailNodes.join(' \u2192 ')
    const n = layer.length
    const mid = Math.floor(n / 2)
    const maxLen = Math.max(...layer.map((name) => name.length))

    for (let k = 0; k < n; k++) {
      const node = layer[k]
      const padW = maxLen - node.length + 1
      let prefix: string, fill: string, bracket: string

      if (k === 0) {
        prefix = '\u251C\u2500 '
        fill = '\u2500'.repeat(padW)
        bracket = '\u2500\u2510'
      } else if (k === n - 1) {
        prefix = '\u2514\u2500 '
        fill = '\u2500'.repeat(padW)
        bracket = '\u2500\u2518'
      } else if (k === mid && tailStr) {
        prefix = '\u251C\u2500 '
        fill = ' '.repeat(padW)
        bracket = '\u2500\u2524  ' + tailStr
      } else {
        prefix = '\u251C\u2500 '
        fill = ' '.repeat(padW)
        bracket = ' \u2502'
      }
      result.push(`${prefix}${node}${fill}${bracket}`)
    }
  }
  flush()
  return result
}

/* ── Parallel group detection ────────────────────────────────────── */

export function findParallelMembers(edgeMap: Record<string, string[]>): Set<string> {
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

/* ── Event segmentation ──────────────────────────────────────────── */

export type Segment =
  | { type: 'normal'; events: NodeEvent[] }
  | { type: 'parallel'; events: NodeEvent[] }
  | { type: 'cycle'; iterations: NodeEvent[][] }

export function segmentEvents(events: NodeEvent[], edgeMap?: Record<string, string[]>): Segment[] {
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
