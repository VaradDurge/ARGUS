'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import CompareSelector from './CompareSelector'
import DiffView from './DiffView'
import type { RunSummary, RunRecord } from '@/lib/types'

function CompareContent() {
  const searchParams = useSearchParams()
  const idA = searchParams.get('a') ?? ''
  const idB = searchParams.get('b') ?? ''

  const [allRuns, setAllRuns] = useState<RunSummary[]>([])
  const [runA, setRunA] = useState<RunRecord | null>(null)
  const [runB, setRunB] = useState<RunRecord | null>(null)

  useEffect(() => {
    fetch('/api/runs')
      .then((r) => r.json())
      .then(setAllRuns)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!idA || !idB) {
      setRunA(null)
      setRunB(null)
      return
    }
    fetch(`/api/compare?a=${idA}&b=${idB}`)
      .then((r) => r.json())
      .then(({ a, b }: { a: RunRecord; b: RunRecord }) => {
        setRunA(a)
        setRunB(b)
      })
      .catch(() => {})
  }, [idA, idB])

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
