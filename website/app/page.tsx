'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import RunTable from '@/components/RunTable'
import EvaluationBuilder from '@/components/EvaluationBuilder'
import type { EvalState } from '@/components/EvaluationBuilder'
import Link from 'next/link'
import type { RunSummary } from '@/lib/types'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export default function RunListPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [evalState, setEvalState] = useState<EvalState | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login')
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (!user) return

    supabase
      .from('runs')
      .select(
        'run_id, overall_status, started_at, duration_ms, step_count, first_failure_step, argus_version, parent_run_id, data'
      )
      .order('started_at', { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) return
        setRuns(
          data.map((row: Record<string, unknown>) => ({
            run_id: row.run_id as string,
            overall_status: (row.overall_status ?? 'unknown') as RunSummary['overall_status'],
            started_at: row.started_at as string,
            duration_ms: row.duration_ms as number | null,
            step_count: (row.step_count ?? (row.data as Record<string, unknown[]> | null)?.steps?.length ?? 0) as number,
            first_failure_step: row.first_failure_step as string | null,
            graph_node_names: ((row.data as Record<string, unknown>)?.graph_node_names ?? []) as string[],
            argus_version: (row.argus_version ?? '') as string,
            parent_run_id: row.parent_run_id as string | null,
          }))
        )
      })
  }, [user])

  if (authLoading || !user) {
    return (
      <div className="py-24 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Loading...
      </div>
    )
  }

  const counts = {
    total: runs.length,
    clean: runs.filter((r) => r.overall_status === 'clean').length,
    failed: runs.filter((r) => r.overall_status !== 'clean').length,
    crashed: runs.filter((r) => r.overall_status === 'crashed').length,
  }

  const passRate = counts.total > 0
    ? Math.round((counts.clean / counts.total) * 100)
    : null

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-9">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Runs
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Pipeline execution history
          </p>
        </div>

        <Link
          href="/compare"
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
          style={{
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 5.5a3.5 3.5 0 1 1 1.05 2.45" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            <path d="M2 7.5V5.5h2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Compare
        </Link>
      </div>

      {/* Stat cards */}
      {counts.total > 0 && (
        <div className="grid grid-cols-4 gap-3.5 mb-9">
          <StatCard label="Total" value={counts.total} />
          <StatCard
            label="Clean"
            value={counts.clean}
            valueColor="#22c55e"
            dimmed={counts.clean === 0}
          />
          <StatCard
            label="Failed"
            value={counts.failed}
            valueColor={counts.failed > 0 ? '#ef4444' : undefined}
            dimmed={counts.failed === 0}
          />
          <StatCard
            label="Pass rate"
            value={passRate !== null ? `${passRate}%` : '\u2014'}
            valueColor={
              passRate === null ? undefined :
              passRate === 100 ? '#22c55e' :
              passRate >= 70 ? '#f59e0b' :
              '#ef4444'
            }
          />
        </div>
      )}

      {/* Divider */}
      <div className="mb-7" style={{ height: '1px', background: 'var(--border-default)' }} />

      {/* Evaluation builder */}
      <EvaluationBuilder onEval={setEvalState} currentEval={evalState} />

      <RunTable runs={runs} evalState={evalState} />
    </div>
  )
}

function StatCard({
  label,
  value,
  valueColor,
  dimmed = false,
}: {
  label: string
  value: string | number
  valueColor?: string
  dimmed?: boolean
}) {
  return (
    <div
      className="rounded-lg px-4 py-3 flex flex-col gap-1.5 transition-all hover:-translate-y-[1px]"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      <span className="text-[10px] uppercase tracking-widest font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      <span
        className="text-xl font-semibold tracking-tight font-mono"
        style={{ color: valueColor ?? 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  )
}
