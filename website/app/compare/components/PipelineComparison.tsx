'use client'

import type { RunRecord } from '@/lib/types'
import { formatDur } from '@/lib/run-utils'
import type { NodeDiff } from '../lib/compare-utils'
import { STEP_ICON, STATUS_LABEL } from '../lib/compare-utils'

const SENTINEL = new Set(['__start__', '__end__', 'START', 'END'])

function displayName(name: string): string {
  return name.length > 12 ? `${name.slice(0, 11)}...` : name
}

function dagLayers(nodes: string[], edgeMap: Record<string, string[]>): string[][] {
  const nodeSet = new Set(nodes)
  const indegree = new Map(nodes.map((n) => [n, 0]))
  const outgoing = new Map<string, string[]>()
  let usableEdgeCount = 0
  for (const node of nodes) outgoing.set(node, [])
  for (const [source, targets] of Object.entries(edgeMap ?? {})) {
    if (!nodeSet.has(source)) continue
    for (const target of targets ?? []) {
      if (!nodeSet.has(target)) continue
      usableEdgeCount++
      outgoing.get(source)?.push(target)
      indegree.set(target, (indegree.get(target) ?? 0) + 1)
    }
  }
  if (usableEdgeCount === 0) return nodes.map((n) => [n])
  const layers: string[][] = []
  let ready = nodes.filter((n) => (indegree.get(n) ?? 0) === 0)
  const seen = new Set<string>()
  while (ready.length > 0) {
    const layer = ready.filter((n) => !seen.has(n))
    if (layer.length === 0) break
    layers.push(layer)
    for (const node of layer) seen.add(node)
    const next: string[] = []
    for (const node of layer) {
      for (const target of outgoing.get(node) ?? []) {
        indegree.set(target, (indegree.get(target) ?? 0) - 1)
        if ((indegree.get(target) ?? 0) === 0) next.push(target)
      }
    }
    ready = nodes.filter((n) => next.includes(n))
  }
  const leftovers = nodes.filter((n) => !seen.has(n))
  if (leftovers.length) layers.push(...leftovers.map((n) => [n]))
  return layers.length ? layers : nodes.map((n) => [n])
}

function nodeVisual(status: string | undefined, diffType?: 'improved' | 'degraded' | 'unchanged') {
  if (!status) return { color: '#5d6370', border: '#2c2f3a', bg: '#1c1d24' }
  const colors: Record<string, { color: string; border: string; bg: string }> = {
    pass:           { color: '#3d9e7d', border: 'rgba(61,158,125,0.32)', bg: 'rgba(61,158,125,0.055)' },
    crashed:        { color: '#d65c5c', border: 'rgba(214,92,92,0.38)', bg: 'rgba(214,92,92,0.075)' },
    fail:           { color: '#d49a2e', border: 'rgba(212,154,46,0.42)', bg: 'rgba(212,154,46,0.075)' },
    semantic_fail:  { color: '#9a6dc6', border: 'rgba(154,109,198,0.38)', bg: 'rgba(154,109,198,0.075)' },
    degraded_input: { color: '#f97316', border: 'rgba(249,115,22,0.34)', bg: 'rgba(249,115,22,0.065)' },
    interrupted:    { color: '#d49a2e', border: 'rgba(212,154,46,0.42)', bg: 'rgba(212,154,46,0.075)' },
  }
  return colors[status] ?? { color: '#5d6370', border: '#2c2f3a', bg: '#1c1d24' }
}

function MiniPipeline({ run, diffMap, label }: { run: RunRecord; diffMap: Map<string, NodeDiff>; label: string }) {
  const nodes = (run.graph_node_names ?? []).filter((n) => !n.startsWith('__') && !SENTINEL.has(n))
  const layers = dagLayers(nodes, run.graph_edge_map ?? {})
  const stepMap = new Map((run.steps ?? []).map((s) => [s.node_name, s]))

  let counter = 0

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-1 h-4 rounded-full shrink-0" style={{ background: STATUS_LABEL[run.overall_status] ? (run.overall_status === 'clean' ? '#3d9e7d' : '#d65c5c') : '#5d6370' }} />
        <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
      </div>
      <div className="flex items-center py-1.5 overflow-x-auto">
        {layers.map((layer, layerIndex) => {
          const isLast = layerIndex === layers.length - 1
          return (
            <div key={layer.join('|')} className="flex items-center shrink-0">
              <div className="flex flex-col gap-2.5">
                {layer.map((name) => {
                  counter++
                  const step = stepMap.get(name)
                  const diff = diffMap.get(name)
                  const visual = nodeVisual(step?.status)
                  const icon = step ? (STEP_ICON[step.status]?.icon ?? '') : ''
                  return (
                    <div
                      key={name}
                      className="relative w-[82px] h-[56px] rounded-[12px] flex flex-col items-center justify-center gap-0.5"
                      style={{
                        background: visual.bg,
                        border: `2px solid ${visual.border}`,
                        color: visual.color,
                      }}
                    >
                      <span
                        className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold tabular-nums"
                        style={{ background: visual.color, color: '#ffffff' }}
                      >
                        {counter}
                      </span>
                      <span className="text-[11px] font-bold tracking-tight text-center px-1 leading-none" style={{ color: 'var(--text-primary)' }} title={name}>
                        {displayName(name)}
                      </span>
                      <span className="text-[10px] font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {step ? formatDur(step.duration_ms) : '\u2014'}
                      </span>
                      {icon && (
                        <span className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                          style={{ background: '#141519', color: visual.color, boxShadow: '0 2px 6px rgba(0,0,0,0.25)', border: '1px solid var(--border-subtle)' }}
                        >
                          {icon}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              {!isLast && (
                <div className="w-[24px] flex items-center justify-center shrink-0">
                  <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
                    <path d="M0 7h18" stroke="var(--border-default)" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M16 3.5L20 7l-4 3.5" stroke="var(--border-default)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PipelineComparison({
  runA,
  runB,
  diffs,
}: {
  runA: RunRecord
  runB: RunRecord
  diffs: NodeDiff[]
}) {
  const diffMap = new Map(diffs.map((d) => [d.name, d]))

  const labelA = runA.parent_run_id ? 'Replay (Original)' : 'Base Run'
  const labelB = runB.parent_run_id ? `Replay ${runB.run_id.includes('-R') ? runB.run_id.split('-R').pop() : '1'}` : 'Comparison Run'

  const statusA = runA.overall_status === 'clean' ? '' : ` (${STATUS_LABEL[runA.overall_status] ?? 'Failed'})`
  const statusB = runB.overall_status === 'clean' ? ' (Fixed)' : ` (${STATUS_LABEL[runB.overall_status] ?? ''})`

  return (
    <div
      className="card rounded-xl p-3.5"
    >
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>Pipeline Overview</h3>
        <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#3d9e7d' }} /> Improved</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#d65c5c' }} /> Degraded</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#5d6370' }} /> Unchanged</span>
        </div>
      </div>

      <MiniPipeline run={runA} diffMap={diffMap} label={`${labelA}${statusA}`} />

      <div className="flex justify-center py-1">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v10M5 10l3 3 3-3" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <MiniPipeline run={runB} diffMap={diffMap} label={`${labelB}${statusB}`} />
    </div>
  )
}
