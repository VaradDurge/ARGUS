'use client'

import { useEffect, useState } from 'react'
import type { RunRecord } from '@/lib/types'
import CliRunView from '@/components/CliRunView'
import CliLogViewer from '@/components/CliLogViewer'

export default function RunDetailClient({ id }: { id: string }) {
  const [run, setRun] = useState<RunRecord | null>(null)
  const [log, setLog] = useState<string | null>(null)

  useEffect(() => {
    if (!id || id === '_') return
    fetch(`/api/runs/${id}`)
      .then((r) => r.json())
      .then(setRun)
      .catch(() => {})
    fetch(`/api/logs/${id}`)
      .then((r) => (r.ok ? r.text() : Promise.resolve('')))
      .then((t) => setLog(t || null))
      .catch(() => {})
  }, [id])

  if (!run) {
    return (
      <div className="py-24 text-center text-sm" style={{ color: '#3f3f46' }}>
        Loading run…
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
