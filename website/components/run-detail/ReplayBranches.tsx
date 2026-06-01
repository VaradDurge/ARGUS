'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { RunRecord, RunSummary } from '@/lib/types'
import { formatDur } from '@/lib/run-utils'

type Tab = 'Overview' | 'Pipeline' | 'AI Analysis' | 'Correlations' | 'State' | 'Logs'

interface ReplayTreeNode {
  run_id: string
  started_at: string
  overall_status: string
  duration_ms: number | null
  step_count: number
  replay_from_step: string | null
  children: ReplayTreeNode[]
}

function dotColor(status: string): string {
  if (status === 'clean') return '#3d9e7d'
  if (status === 'crashed') return '#d65c5c'
  if (status === 'silent_failure') return '#d49a2e'
  if (status === 'semantic_fail') return '#9a6dc6'
  if (status === 'interrupted') return '#d49a2e'
  return '#5d6370'
}

function getStatusInfo(status: string, parentFailing: boolean) {
  if (status === 'clean' && parentFailing) return { label: 'successful recovery', color: '#3d9e7d', bg: 'rgba(61,158,125,0.10)' }
  if (status === 'clean') return { label: 'clean', color: '#3d9e7d', bg: 'rgba(61,158,125,0.10)' }
  if (status === 'crashed') return { label: 'crashed', color: '#d65c5c', bg: 'rgba(214,92,92,0.10)' }
  if (status === 'silent_failure') return { label: 'semantic degradation persisted', color: '#d49a2e', bg: 'rgba(212,154,46,0.10)' }
  if (status === 'semantic_fail') return { label: 'changed retrieval prompt', color: '#9a6dc6', bg: 'rgba(154,109,198,0.10)' }
  if (status === 'interrupted') return { label: 'interrupted', color: '#d49a2e', bg: 'rgba(212,154,46,0.10)' }
  return { label: status.replace(/_/g, ' '), color: '#5d6370', bg: 'rgba(93,99,112,0.10)' }
}

function fmtBranchTime(iso: string): string {
  try {
    const d = new Date(iso)
    const month = d.toLocaleString('en-US', { month: 'short' })
    const day = d.getDate()
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${month} ${day}, ${h}:${m}`
  } catch {
    return ''
  }
}

/* ── Single node row ───────────────────────────────────────── */

function ReplayNodeRow({
  node,
  label,
  previousRunId,
  depth,
  parentFailing,
  isLast,
  router,
}: {
  node: ReplayTreeNode
  label: string
  previousRunId: string
  depth: number
  parentFailing: boolean
  isLast: boolean
  router: ReturnType<typeof useRouter>
}) {
  const color = dotColor(node.overall_status)
  const info = getStatusInfo(node.overall_status, parentFailing)
  const isClean = node.overall_status === 'clean'
  const hasChildren = node.children && node.children.length > 0

  return (
    <div className="relative mb-1">
      <div className="flex items-center gap-0">
        <div className="relative shrink-0" style={{ width: 32, height: 28 }}>
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: -8, width: 22, height: 1.5, background: 'rgba(152,162,179,0.35)' }}
          />
          <span
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{ left: 14, width: 8, height: 8, background: color }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer"
            style={{
              background: '#141519',
              border: '1px solid var(--border-subtle)',
              transition: 'background 100ms',
            }}
            onClick={() => {
              const nextRun = encodeURIComponent(node.run_id)
              const fromRun = encodeURIComponent(previousRunId)
              router.replace(`/?run=${nextRun}&from=${fromRun}`, { scroll: false })
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#141519' }}
          >
            <span className="text-[12.5px] font-bold tracking-[-0.01em]" style={{ color: 'var(--text-primary)' }}>
              Rerun {label}
            </span>
            <span
              className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md leading-none shrink-0"
              style={{ color: info.color, background: info.bg }}
            >
              {info.label}
            </span>
            {isClean && (
              <svg width="11" height="11" viewBox="0 0 13 13" fill="none" className="shrink-0" style={{ color: '#3d9e7d' }}>
                <path d="M2.5 6.5l3 3 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            <div className="flex-1" />
            <div className="flex flex-col items-end shrink-0 gap-0.5">
              <span className="text-[11px] font-medium tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {fmtBranchTime(node.started_at)}
              </span>
              {hasChildren && (
                <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {node.step_count} steps{node.duration_ms ? ` · ${formatDur(node.duration_ms)}` : ''}
                </span>
              )}
            </div>
          </div>

          {hasChildren && (
            <div className="relative mt-1" style={{ paddingLeft: 32 }}>
              <div
                className="absolute w-[1.5px]"
                style={{ left: 11, top: -16, bottom: 12, background: 'rgba(152,162,179,0.3)' }}
              />
              {node.children.map((child, ci) => (
                <ReplayNodeRow
                  key={child.run_id}
                  node={child}
                  label={`${label}.${ci + 1}`}
                  previousRunId={previousRunId}
                  depth={depth + 1}
                  parentFailing={node.overall_status !== 'clean'}
                  isLast={ci === node.children.length - 1}
                  router={router}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main component ────────────────────────────────────────── */

export default function ReplayBranches({
  run,
  allRuns,
  onSwitchTab,
}: {
  run: RunRecord
  allRuns: RunSummary[]
  onSwitchTab: (tab: Tab) => void
}) {
  const router = useRouter()
  const [children, setChildren] = useState<ReplayTreeNode[]>([])

  useEffect(() => {
    fetch(`/api/runs/${run.run_id}/tree`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((tree: ReplayTreeNode) => setChildren(tree.children ?? []))
      .catch(() => {
        setChildren(
          allRuns
            .filter((r) => r.parent_run_id === run.run_id)
            .map((r) => ({
              run_id: r.run_id,
              started_at: r.started_at,
              overall_status: r.overall_status,
              duration_ms: r.duration_ms,
              step_count: r.step_count,
              replay_from_step: null,
              children: [],
            }))
        )
      })
  }, [run.run_id, allRuns])

  const originColor = dotColor(run.overall_status)
  const originFailing = run.overall_status !== 'clean'
  const originLabel = run.overall_status === 'clean' ? 'clean' : 'failed'
  const total = children.length

  return (
    <div className="card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <h3 className="text-[13px] font-bold tracking-[-0.01em]" style={{ color: 'var(--text-primary)' }}>
          Rerun Branches{total > 0 ? ` (${total})` : ''}
        </h3>
        <button
          onClick={() => onSwitchTab('Pipeline')}
          className="text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors"
          style={{ color: '#7c7fc7', border: '1px solid rgba(124,127,199,0.22)', background: 'rgba(124,127,199,0.04)' }}
        >
          + Rerun
        </button>
      </div>

      <div className="px-3.5 py-2.5">
        {/* Original run row */}
        <div className="relative flex items-center gap-2.5 mb-1.5">
          <div className="relative shrink-0 flex flex-col items-center" style={{ width: 16 }}>
            <span className="rounded-full shrink-0" style={{ width: 10, height: 10, background: originColor }} />
            {total > 0 && (
              <div className="w-[1.5px]" style={{ flex: 1, minHeight: 6, background: 'rgba(152,162,179,0.3)', marginTop: 2 }} />
            )}
          </div>

          <div
            className="flex-1 flex items-center gap-2 min-w-0 px-2.5 py-1.5 rounded-lg"
            style={{ background: '#141519', border: '1px solid var(--border-subtle)' }}
          >
            <span className="text-[12.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
              Original Run
            </span>
            <span
              className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md leading-none"
              style={{
                color: originFailing ? '#d65c5c' : '#3d9e7d',
                background: originFailing ? 'rgba(214,92,92,0.08)' : 'rgba(61,158,125,0.08)',
              }}
            >
              {originLabel}
            </span>
            <div className="flex-1" />
            <span className="text-[11px] font-medium tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
              {run.steps?.length ?? 0} steps{run.duration_ms ? ` · ${formatDur(run.duration_ms)}` : ''}
            </span>
          </div>
        </div>

        {/* Children tree */}
        {total > 0 ? (
          <div className="relative" style={{ paddingLeft: 16 }}>
            <div
              className="absolute w-[1.5px]"
              style={{ left: 8, top: -12, bottom: 12, background: 'rgba(152,162,179,0.3)' }}
            />
            {children.map((child, i) => (
              <ReplayNodeRow
                key={child.run_id}
                node={child}
                label={`${i + 1}`}
                previousRunId={run.run_id}
                depth={1}
                parentFailing={originFailing}
                isLast={i === children.length - 1}
                router={router}
              />
            ))}
          </div>
        ) : (
          <div className="py-3 text-center text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            No reruns yet
          </div>
        )}
      </div>
    </div>
  )
}
