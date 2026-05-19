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
          data
            .map((row: Record<string, unknown>) => ({
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
            // Hide resume runs — they are stitched into the interrupted parent on the detail page
            .filter((r) => !r.parent_run_id)
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
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
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
          className="flex items-center gap-2 text-[13px] font-medium px-4 py-2 rounded-lg transition-all"
          style={{
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7a4 4 0 1 1 1.2 2.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            <path d="M3 9.5V7h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Compare
        </Link>
      </div>

      {/* Stat cards */}
      {counts.total > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<IconTotal />}
            label="Total Runs"
            value={counts.total}
          />
          <StatCard
            icon={<IconClean />}
            label="Clean"
            value={counts.clean}
            valueColor="#10b981"
            dimmed={counts.clean === 0}
          />
          <StatCard
            icon={<IconFailed />}
            label="Failed"
            value={counts.failed}
            valueColor={counts.failed > 0 ? '#ef4444' : undefined}
            dimmed={counts.failed === 0}
          />
          <StatCard
            icon={<IconRate />}
            label="Pass Rate"
            value={passRate !== null ? `${passRate}%` : '\u2014'}
            valueColor={
              passRate === null ? undefined :
              passRate === 100 ? '#10b981' :
              passRate >= 70 ? '#f59e0b' :
              '#ef4444'
            }
          />
        </div>
      )}

      {/* Evaluation builder */}
      <EvaluationBuilder onEval={setEvalState} currentEval={evalState} />

      <RunTable runs={runs} evalState={evalState} />
    </div>
  )
}

// ── Stat card icons ──────────────────────────────────────────────────

function IconTotal() {
  return (
    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.08)' }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 5h12M3 9h8M3 13h5" stroke="#6366f1" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    </div>
  )
}

function IconClean() {
  return (
    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.08)' }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M5 9l3 3 5-5" stroke="#10b981" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function IconFailed() {
  return (
    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.08)' }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 6v3.5M9 12h.01" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M9 3L16 15H2L9 3Z" stroke="#ef4444" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function IconRate() {
  return (
    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.08)' }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 13l4-4 3 2 5-6" stroke="#f59e0b" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  valueColor,
  dimmed = false,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  valueColor?: string
  dimmed?: boolean
}) {
  return (
    <div
      className="card rounded-xl px-5 py-4 flex items-center gap-4 transition-all"
      style={{
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {icon}
      <div>
        <div className="text-[11px] font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
          {label}
        </div>
        <div
          className="text-2xl font-bold tabular-nums tracking-tight"
          style={{ color: valueColor ?? 'var(--text-primary)' }}
        >
          {value}
        </div>
      </div>
    </div>
  )
}
