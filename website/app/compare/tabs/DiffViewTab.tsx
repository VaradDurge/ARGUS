'use client'

import { useState } from 'react'
import type { RunRecord } from '@/lib/types'
import { computeDiffs } from '../lib/compare-utils'
import StructuredDiff from '../components/StructuredDiff'

export default function DiffViewTab({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const { nodes } = computeDiffs(runA, runB)
  const [selectedNode, setSelectedNode] = useState<string | undefined>(undefined)

  return (
    <div className="py-4 space-y-4">
      {/* Node selector */}
      <div className="flex items-center gap-3">
        <span className="text-[12px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Node:</span>
        <select
          value={selectedNode ?? ''}
          onChange={(e) => setSelectedNode(e.target.value || undefined)}
          className="text-[12px] font-mono px-3 py-1.5 rounded-lg"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
        >
          <option value="">First differing node</option>
          {nodes.map((n) => (
            <option key={n.name} value={n.name}>{n.name}</option>
          ))}
        </select>
      </div>

      <StructuredDiff diffs={nodes} selectedNode={selectedNode} />
    </div>
  )
}
