'use client'

import type { RunRecord } from '@/lib/types'
import { computeDiffs } from '../lib/compare-utils'
import NodeComparisonTable from '../components/NodeComparisonTable'

export default function NodeComparisonTab({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const { nodes } = computeDiffs(runA, runB)
  return (
    <div className="py-4">
      <NodeComparisonTable diffs={nodes} />
    </div>
  )
}
