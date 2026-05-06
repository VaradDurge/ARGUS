'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RunRecord } from '@/lib/types'
import CliRunView from '@/components/CliRunView'
import CliLogViewer from '@/components/CliLogViewer'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export default function RunDetailClient({ id }: { id: string }) {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [run, setRun] = useState<RunRecord | null>(null)
  const [log, setLog] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLocal, setIsLocal] = useState<boolean | null>(null)

  // Detect local mode once on mount
  useEffect(() => {
    fetch('/api/runs')
      .then((r) => setIsLocal(r.ok))
      .catch(() => setIsLocal(false))
  }, [])

  useEffect(() => {
    if (!authLoading && !user && isLocal === false) {
      router.replace('/login')
    }
  }, [authLoading, user, isLocal, router])

  useEffect(() => {
    if (isLocal === null) return // still detecting

    const segments = window.location.pathname.replace(/\/+$/, '').split('/')
    const runId = segments[segments.length - 1]
    if (!runId || runId === '_') return

    if (isLocal) {
      fetch(`/api/runs/${runId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { setError('Run not found'); return }
          setRun(data as RunRecord)
        })
        .catch(() => setError('Failed to load run'))
      return
    }

    // Supabase path (requires auth)
    if (!user) return

    const fetchRun = async () => {
      const { data, error: err } = await supabase
        .from('runs')
        .select('data')
        .ilike('run_id', `${runId}%`)
        .limit(1)
        .single()

      if (err || !data) {
        setError('Run not found')
        return
      }

      const baseRun = data.data as RunRecord

      // If interrupted, look for the resume run and stitch steps together
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
          return
        }
      }

      setRun(baseRun)
    }

    fetchRun()
  }, [id, user, isLocal])

  if (authLoading || isLocal === null) {
    return (
      <div className="py-24 text-center text-sm" style={{ color: '#3f3f46' }}>
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-24 text-center text-sm" style={{ color: '#dc2626' }}>
        Error: {error}
      </div>
    )
  }

  if (!run) {
    return (
      <div className="py-24 text-center text-sm" style={{ color: '#3f3f46' }}>
        Loading run...
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <CliRunView run={run} />
      {log && <CliLogViewer log={log} runId={run.run_id} />}
    </div>
  )
}
