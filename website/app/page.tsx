'use client'

import { useEffect, useState } from 'react'
import RunTable from '@/components/RunTable'
import Link from 'next/link'
import type { RunSummary } from '@/lib/types'

export default function RunListPage() {
  const [runs, setRuns] = useState<RunSummary[]>([])

  useEffect(() => {
    fetch('/api/runs')
      .then((r) => r.json())
      .then((data) => setRuns(data))
      .catch(() => {})
  }, [])

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
            value={passRate !== null ? `${passRate}%` : '—'}
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

      <RunTable runs={runs} />
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
