'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import type { RunSummary, RunRecord } from '@/lib/types'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import CompareHeader from './CompareHeader'
import CompareTabNav, { type TabId } from './CompareTabNav'
import OverviewTab from './tabs/OverviewTab'
import NodeComparisonTab from './tabs/NodeComparisonTab'
import DiffViewTab from './tabs/DiffViewTab'
import MetricsTab from './tabs/MetricsTab'
import AIAnalysisTab from './tabs/AIAnalysisTab'
import TimelineTab from './tabs/TimelineTab'
import LogsTab from './tabs/LogsTab'

function CompareContent() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const idA = searchParams.get('a') ?? ''
  const idB = searchParams.get('b') ?? ''

  const [isLocal, setIsLocal] = useState<boolean | null>(null)
  const [allRuns, setAllRuns] = useState<RunSummary[]>([])
  const [runA, setRunA] = useState<RunRecord | null>(null)
  const [runB, setRunB] = useState<RunRecord | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  // Detect local mode once on mount
  useEffect(() => {
    fetch('/api/runs')
      .then((r) => setIsLocal(r.ok))
      .catch(() => setIsLocal(false))
  }, [])

  useEffect(() => {
    if (isLocal === false && !authLoading && !user) {
      router.replace('/login')
    }
  }, [authLoading, user, isLocal, router])

  // Load run list for selector
  useEffect(() => {
    if (isLocal === null) return

    if (isLocal) {
      fetch('/api/runs')
        .then((r) => r.json())
        .then((data: RunSummary[]) => setAllRuns(data))
        .catch(() => {})
      return
    }

    if (!user) return
    supabase
      .from('runs')
      .select(
        'run_id, overall_status, started_at, duration_ms, step_count, first_failure_step, argus_version, parent_run_id, data'
      )
      .order('started_at', { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) return
        setAllRuns(
          data.map((row: Record<string, unknown>) => ({
            run_id: row.run_id as string,
            overall_status: (row.overall_status ?? 'unknown') as RunSummary['overall_status'],
            started_at: row.started_at as string,
            duration_ms: row.duration_ms as number | null,
            step_count: (row.step_count ?? 0) as number,
            first_failure_step: row.first_failure_step as string | null,
            graph_node_names: ((row.data as Record<string, unknown>)?.graph_node_names ?? []) as string[],
            argus_version: (row.argus_version ?? '') as string,
            parent_run_id: row.parent_run_id as string | null,
          }))
        )
      })
  }, [isLocal, user])

  // Load the two selected runs
  useEffect(() => {
    if (isLocal === null) return

    if (!idA || !idB) {
      setRunA(null)
      setRunB(null)
      return
    }

    if (isLocal) {
      fetch(`/api/compare?a=${idA}&b=${idB}`)
        .then((r) => r.json())
        .then((data: { a: RunRecord | null; b: RunRecord | null }) => {
          setRunA(data.a)
          setRunB(data.b)
        })
        .catch(() => {})
      return
    }

    if (!user) return

    async function loadRun(runId: string): Promise<RunRecord | null> {
      const { data, error } = await supabase
        .from('runs')
        .select('data')
        .ilike('run_id', `${runId}%`)
        .limit(1)
        .single()
      if (error || !data) return null
      return data.data as RunRecord
    }

    Promise.all([loadRun(idA), loadRun(idB)]).then(([a, b]) => {
      setRunA(a)
      setRunB(b)
    })
  }, [idA, idB, isLocal, user])

  function handleSelectA(id: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('a', id)
    router.push(`/compare?${params.toString()}`)
  }

  function handleSelectB(id: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('b', id)
    router.push(`/compare?${params.toString()}`)
  }

  if (isLocal === null || (isLocal === false && (authLoading || !user))) {
    return (
      <div className="py-24 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Loading...
      </div>
    )
  }

  const renderTab = () => {
    if (!runA || !runB) return null
    switch (activeTab) {
      case 'overview': return <OverviewTab runA={runA} runB={runB} />
      case 'node-comparison': return <NodeComparisonTab runA={runA} runB={runB} />
      case 'diff-view': return <DiffViewTab runA={runA} runB={runB} />
      case 'metrics': return <MetricsTab runA={runA} runB={runB} />
      case 'ai-analysis': return <AIAnalysisTab runA={runA} runB={runB} />
      case 'timeline': return <TimelineTab runA={runA} runB={runB} />
      case 'logs': return <LogsTab />
      default: return null
    }
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.02em]" style={{ color: 'var(--text-primary)' }}>
            Compare Runs
          </h1>
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Side-by-side comparison of pipeline executions
          </p>
        </div>
        <a
          href="/"
          className="text-[12px] font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 9L4.5 6l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Back to run
        </a>
      </div>

      {/* Header with selectors */}
      <CompareHeader
        runs={allRuns}
        selectedA={idA}
        selectedB={idB}
        runA={runA}
        runB={runB}
        onSelectA={handleSelectA}
        onSelectB={handleSelectB}
      />

      {/* Tabs */}
      {runA && runB && (
        <>
          <CompareTabNav active={activeTab} onChange={setActiveTab} />
          {renderTab()}
        </>
      )}

      {/* Empty states */}
      {(!runA || !runB) && idA && idB && (
        <div className="text-center py-16 text-sm font-mono" style={{ color: 'var(--text-faint)' }}>
          Could not load one or both runs.
        </div>
      )}

      {(!idA || !idB) && (
        <div className="text-center py-24 font-mono text-[12px]" style={{ color: 'var(--text-faint)' }}>
          Select two runs to compare
        </div>
      )}
    </div>
  )
}

export default function ComparePage() {
  return (
    <div className="px-8 py-6 overflow-auto h-full">
      <Suspense fallback={<div />}>
        <CompareContent />
      </Suspense>
    </div>
  )
}
