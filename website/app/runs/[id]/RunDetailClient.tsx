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

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login')
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (!user) return

    // Read the actual run ID from the browser URL
    const segments = window.location.pathname.replace(/\/+$/, '').split('/')
    const runId = segments[segments.length - 1]
    if (!runId || runId === '_') return

    supabase
      .from('runs')
      .select('data')
      .ilike('run_id', `${runId}%`)
      .limit(1)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('Run not found')
          return
        }
        setRun(data.data as RunRecord)
      })
  }, [id, user])

  if (authLoading) {
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
