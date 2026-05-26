'use client'

import { useEffect, useState } from 'react'
import type { RunRecord, RunSummary } from './types'
import { useAuth } from './auth'
import { supabase } from './supabase'

/* ── useRunList ─────────────────────────────────────────────────── */

export function useRunList() {
  const { user, loading: authLoading } = useAuth()
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [isLocal, setIsLocal] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/runs')
      .then((r) => setIsLocal(r.ok))
      .catch(() => setIsLocal(false))
  }, [])

  useEffect(() => {
    if (isLocal === null) return

    if (isLocal) {
      fetch('/api/runs')
        .then((r) => r.json())
        .then((data: RunSummary[]) => {
          setRuns(data.filter((r) => !r.parent_run_id))
          setLoading(false)
        })
        .catch(() => setLoading(false))
      return
    }

    if (!user) {
      setLoading(false)
      return
    }

    supabase
      .from('runs')
      .select(
        'run_id, overall_status, started_at, duration_ms, step_count, first_failure_step, argus_version, parent_run_id, data'
      )
      .order('started_at', { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) { setLoading(false); return }
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
            .filter((r) => !r.parent_run_id)
        )
        setLoading(false)
      })
  }, [user, isLocal])

  return { runs, loading: loading || authLoading, isLocal, user }
}

/* ── useRunDetail ───────────────────────────────────────────────── */

export function useRunDetail(runId: string | null) {
  const { user } = useAuth()
  const [run, setRun] = useState<RunRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLocal, setIsLocal] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/runs')
      .then((r) => setIsLocal(r.ok))
      .catch(() => setIsLocal(false))
  }, [])

  useEffect(() => {
    if (!runId || isLocal === null) {
      setRun(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    if (isLocal) {
      fetch(`/api/runs/${runId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { setError('Run not found'); setLoading(false); return }
          setRun(data as RunRecord)
          setLoading(false)
        })
        .catch(() => { setError('Failed to load run'); setLoading(false) })
      return
    }

    if (!user) { setLoading(false); return }

    const fetchRun = async () => {
      const { data, error: err } = await supabase
        .from('runs')
        .select('data')
        .ilike('run_id', `${runId}%`)
        .limit(1)
        .single()

      if (err || !data) { setError('Run not found'); setLoading(false); return }

      const baseRun = data.data as RunRecord

      if (baseRun.overall_status === 'interrupted') {
        const { data: resumeRows } = await supabase
          .from('runs')
          .select('data')
          .eq('parent_run_id', baseRun.run_id)
          .order('started_at', { ascending: true })

        if (resumeRows && resumeRows.length > 0) {
          const allSteps = [...(baseRun.steps ?? [])]
          let lastStatus: RunRecord['overall_status'] = baseRun.overall_status
          for (const row of resumeRows) {
            const resumeRun = row.data as RunRecord
            allSteps.push(...(resumeRun.steps ?? []))
            lastStatus = resumeRun.overall_status
          }
          setRun({ ...baseRun, steps: allSteps, overall_status: lastStatus })
          setLoading(false)
          return
        }
      }

      setRun(baseRun)
      setLoading(false)
    }

    fetchRun()
  }, [runId, user, isLocal])

  return { run, loading, error }
}

/* ── useSearch ──────────────────────────────────────────────────── */

export function useSearch(runs: RunSummary[], query: string): RunSummary[] {
  if (!query.trim()) return runs
  const q = query.toLowerCase().trim()
  return runs.filter((r) =>
    r.run_id.toLowerCase().includes(q) ||
    r.overall_status.toLowerCase().includes(q) ||
    r.graph_node_names.some((n) => n.toLowerCase().includes(q))
  )
}
