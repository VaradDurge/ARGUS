'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { RunRecord, RunSummary } from '@/lib/types'
import { useRunDetail } from '@/lib/hooks'
import { STATUS_DOT, formatDur, formatTimestamp } from '@/lib/run-utils'
import ReplayControls from './run-detail/ReplayControls'
import RootCauseBanner from './run-detail/RootCauseBanner'
import MetricsGrid from './run-detail/MetricsGrid'
import ExecutionTimeline from './run-detail/ExecutionTimeline'
import AIAnalysisPanel from './run-detail/AIAnalysisPanel'
import CorrelationPanel from './run-detail/CorrelationPanel'
import BehaviorPanel from './run-detail/BehaviorPanel'
import OverviewTab from './run-detail/OverviewTab'
import JsonViewer from './JsonViewer'
import CliLogViewer from './CliLogViewer'

const STATUS_BG: Record<string, string> = {
  clean: 'rgba(16,185,129,0.08)',
  silent_failure: 'rgba(245,158,11,0.08)',
  crashed: 'rgba(239,68,68,0.08)',
  semantic_fail: 'rgba(168,85,247,0.08)',
  interrupted: 'rgba(245,158,11,0.08)',
}

const STATUS_TEXT: Record<string, string> = {
  clean: '#10b981',
  silent_failure: '#f59e0b',
  crashed: '#ef4444',
  semantic_fail: '#a855f7',
  interrupted: '#f59e0b',
}

const TABS = ['Overview', 'Pipeline', 'AI Analysis', 'Correlations', 'State', 'Logs'] as const
type Tab = typeof TABS[number]

/* ── Logs Tab ────────────────────────────────────────────────── */

function LogsTab({ runId }: { runId: string }) {
  const [log, setLog] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/logs/${runId}`)
      .then((r) => r.ok ? r.text() : null)
      .then((text) => { setLog(text); setLoading(false) })
      .catch(() => setLoading(false))
  }, [runId])

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading logs...</div>
  if (!log) return <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No logs available for this run.</div>

  return (
    <div className="p-5">
      <CliLogViewer log={log} runId={runId} />
    </div>
  )
}

/* ── Main Panel ──────────────────────────────────────────────── */

export default function RunDetailPanel({
  runId,
  previousRunId,
  onClose,
  allRuns,
  isOverlay = false,
}: {
  runId: string | null
  previousRunId?: string | null
  onClose: () => void
  allRuns: RunSummary[]
  isOverlay?: boolean
}) {
  const router = useRouter()
  const { run, loading, error } = useRunDetail(runId)
  const [activeTab, setActiveTab] = useState<Tab>('Overview')
  const [copied, setCopied] = useState(false)

  // Reset tab when run changes
  useEffect(() => { setActiveTab('Overview') }, [runId])

  if (!runId) {
    return (
      <div className="h-full flex flex-col items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <svg width="48" height="48" viewBox="0 0 18 18" fill="none" className="mb-4 opacity-20">
          <path d="M9 1.5L16.5 5.5V12.5L9 16.5L1.5 12.5V5.5L9 1.5Z" stroke="#6366f1" strokeWidth="1.2" fill="none"/>
          <circle cx="9" cy="9" r="2.2" fill="rgba(99,102,241,0.15)" stroke="#6366f1" strokeWidth="1.1"/>
          <circle cx="9" cy="9" r="0.9" fill="#6366f1"/>
        </svg>
        <p className="text-[14px] font-medium" style={{ color: 'var(--text-muted)' }}>Select a run to view details</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-subtle)', borderTopColor: '#6366f1' }} />
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading run...</span>
        </div>
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <p className="text-[13px]" style={{ color: '#ef4444' }}>Error: {error ?? 'Run not found'}</p>
      </div>
    )
  }

  const statusInfo = STATUS_DOT[run.overall_status] ?? { dot: '\u25CF', color: '#9ca3af' }
  const steps = run.steps ?? []
  const canReturnToPreviousRun = Boolean(previousRunId && previousRunId !== run.run_id)

  const copyRunId = () => {
    navigator.clipboard.writeText(run.run_id).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="h-full flex flex-col panel-slide-in" style={{ background: '#ffffff' }}>
      {/* Run header */}
      <div className="shrink-0 px-5 pt-3 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.86)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="w-3.5 h-3.5 rounded-full shrink-0"
                style={{
                  border: `2px solid ${statusInfo.color}`,
                  background: run.overall_status === 'clean' ? 'rgba(16,185,129,0.10)' : 'transparent',
                }}
              />
              <span className="text-[17px] font-bold tracking-[-0.03em] leading-none truncate" style={{ color: 'var(--text-primary)' }}>{run.run_id}</span>
            <span
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg shrink-0 leading-none"
              style={{
                background: STATUS_BG[run.overall_status] ?? 'rgba(156,163,175,0.08)',
                color: STATUS_TEXT[run.overall_status] ?? '#9ca3af',
                border: `1px solid ${STATUS_TEXT[run.overall_status] ?? '#9ca3af'}20`,
              }}
            >
              {run.overall_status.replace(/_/g, ' ')}
            </span>
            <button onClick={copyRunId} className="p-1 rounded-md transition-colors hover:bg-black/5 shrink-0" style={{ color: 'var(--text-muted)' }}>
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M3.5 7.5l2 2 5-5" stroke="#10b981" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M10 4V3a1.5 1.5 0 00-1.5-1.5H3A1.5 1.5 0 001.5 3v5.5A1.5 1.5 0 003 10h1" stroke="currentColor" strokeWidth="1.2"/></svg>
              )}
            </button>
            {canReturnToPreviousRun && (
              <button
                onClick={() => router.replace(`/?run=${encodeURIComponent(previousRunId ?? '')}`, { scroll: false })}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md transition-colors shrink-0"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
              >
                <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                  <path d="M8 3L4.5 6.5 8 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Previous
              </button>
            )}
            </div>

            <div className="mt-2 flex items-center gap-2 flex-wrap text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
              <span>{formatTimestamp(run.started_at)}</span>
              <span style={{ color: 'var(--text-faint)' }}>&middot;</span>
              <span>{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
              <span style={{ color: 'var(--text-faint)' }}>&middot;</span>
              <span>{formatDur(run.duration_ms)}</span>
              <span style={{ color: 'var(--text-faint)' }}>&middot;</span>
              <span className="text-[12px] font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>v{run.argus_version}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/compare?a=${run.run_id}`}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M5.2 4.1h3.6a2.9 2.9 0 110 5.8H7.6" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round"/>
                <path d="M8.8 9.9H5.2a2.9 2.9 0 110-5.8h1.2" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round"/>
              </svg>
              Compare
            </Link>
            <button
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <circle cx="4" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.4"/>
                <circle cx="10.5" cy="3.5" r="1.8" stroke="currentColor" strokeWidth="1.4"/>
                <circle cx="10.5" cy="10.5" r="1.8" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5.7 6.2l3.1-1.8M5.7 7.8l3.1 1.8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
              </svg>
              Share
            </button>
            <button
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="3.5" r="1" fill="currentColor"/>
                <circle cx="7" cy="7" r="1" fill="currentColor"/>
                <circle cx="7" cy="10.5" r="1" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>

        {run.parent_run_id && (
          <div className="mt-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            replay of{' '}
            <button
              onClick={() => {
                const parentRun = encodeURIComponent(run.parent_run_id ?? '')
                const currentRun = encodeURIComponent(run.run_id)
                router.replace(`/?run=${parentRun}&from=${currentRun}`, { scroll: false })
              }}
              className="font-mono hover:text-indigo-500 transition-colors"
            >
              {run.parent_run_id}
            </button>
            {run.replay_from_step && (
              <> from <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{run.replay_from_step}</span></>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="shrink-0 px-5 flex items-center gap-0 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="text-[13px] font-medium px-4 py-3 transition-colors relative whitespace-nowrap"
            style={{
              color: activeTab === tab ? '#6366f1' : 'var(--text-secondary)',
            }}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full" style={{ background: '#6366f1' }} />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {activeTab === 'Overview' && (
          <OverviewTab run={run} allRuns={allRuns} onSwitchTab={setActiveTab} />
        )}

        {activeTab === 'Pipeline' && (
          <ReplayControls runId={run.run_id} run={run}>
            {(handleReplay, handleReplayNode, replayNodeState) => (
              <div className="p-5 space-y-6">
                {run.root_cause_chain && run.root_cause_chain.length > 0 && (
                  <RootCauseBanner chain={run.root_cause_chain} />
                )}
                <MetricsGrid run={run} />
                <ExecutionTimeline
                  run={run}
                  onReplay={handleReplay}
                  onReplayNode={handleReplayNode}
                  replayingNode={replayNodeState.replayingNode}
                  nodeDiff={replayNodeState.nodeDiff}
                  onDismissDiff={replayNodeState.dismissDiff}
                />
              </div>
            )}
          </ReplayControls>
        )}

        {activeTab === 'AI Analysis' && (
          <div className="p-5">
            <AIAnalysisPanel run={run} />
          </div>
        )}

        {activeTab === 'Correlations' && (
          <div className="p-5">
            <CorrelationPanel run={run} />
          </div>
        )}

        {activeTab === 'State' && (
          <div className="p-5 space-y-6">
            {run.initial_state && Object.keys(run.initial_state).length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Initial State</div>
                <JsonViewer data={run.initial_state} defaultCollapsed={true} />
              </div>
            )}
            <BehaviorPanel run={run} />
          </div>
        )}

        {activeTab === 'Logs' && (
          <LogsTab runId={run.run_id} />
        )}
      </div>
    </div>
  )
}
