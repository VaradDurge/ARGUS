'use client'

import { useRouter } from 'next/navigation'
import type { RunSummary, RunStatus } from '@/lib/types'

interface CompareSelectorProps {
  runs: RunSummary[]
  selectedA: string
  selectedB: string
}

const STATUS_COLOR: Record<RunStatus, string> = {
  clean: '#22c55e',
  silent_failure: '#f59e0b',
  crashed: '#ef4444',
  semantic_fail: '#d946ef',
  interrupted: '#f59e0b',
}

function formatTs(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

export default function CompareSelector({ runs, selectedA, selectedB }: CompareSelectorProps) {
  const router = useRouter()

  function navigate(a: string, b: string) {
    const params = new URLSearchParams()
    if (a) params.set('a', a)
    if (b) params.set('b', b)
    const qs = params.toString()
    router.push(qs ? `/compare?${qs}` : '/compare')
  }

  return (
    <div className="flex items-end gap-4 flex-wrap">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-medium">
          Before (Run A)
        </label>
        <select
          className="border text-xs rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/40 min-w-[280px] cursor-pointer transition-colors text-[var(--text-primary)]"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
          value={selectedA}
          onChange={(e) => navigate(e.target.value, selectedB)}
        >
          <option value="">-- select run --</option>
          {runs.map((r) => (
            <option key={r.run_id} value={r.run_id}>
              {r.run_id.slice(0, 20)} · {r.overall_status} · {formatTs(r.started_at)}
            </option>
          ))}
        </select>
      </div>

      <span className="text-[var(--text-muted)] text-sm pb-2.5 font-mono">vs</span>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-medium">
          After (Run B)
        </label>
        <select
          className="border text-xs rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/40 min-w-[280px] cursor-pointer transition-colors text-[var(--text-primary)]"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
          value={selectedB}
          onChange={(e) => navigate(selectedA, e.target.value)}
        >
          <option value="">-- select run --</option>
          {runs.map((r) => (
            <option key={r.run_id} value={r.run_id}>
              {r.run_id.slice(0, 20)} · {r.overall_status} · {formatTs(r.started_at)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
