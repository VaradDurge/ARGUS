'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import CompareSelector from './CompareSelector'
import DiffView from './DiffView'
import type { RunSummary, RunRecord } from '@/lib/types'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

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

  if (isLocal === null || (isLocal === false && (authLoading || !user))) {
    return (
      <div className="py-24 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Loading...
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight font-mono" style={{ color: 'var(--text-primary)' }}>
          argus diff
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          Side-by-side pipeline comparison
        </p>
      </div>

      <CompareSelector runs={allRuns} selectedA={idA} selectedB={idB} />

      {runA && runB && <DiffView runA={runA} runB={runB} />}

      {(!runA || !runB) && idA && idB && (
        <div className="text-center py-16 text-[#4a4a4a] text-sm">
          Could not load one or both runs.
        </div>
      )}

      {(!idA || !idB) && (
        <div className="text-center py-20 text-[#3a3a3a] text-xs font-mono">
          Select two runs above to compare them.
        </div>
      )}
    </div>
  )
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div />}>
      <CompareContent />
    </Suspense>
  )
}
