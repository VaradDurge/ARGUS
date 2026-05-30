'use client'

import type { RunRecord } from '@/lib/types'
import { computeDiffs, computeSummaryMetrics, computeChangeImpact, computeKeyChanges } from '../lib/compare-utils'
import SummaryMetrics from '../components/SummaryMetrics'
import PipelineComparison from '../components/PipelineComparison'
import KeyChangesSummary from '../components/KeyChangesSummary'
import ChangeImpactChart from '../components/ChangeImpactChart'
import NodeComparisonTable from '../components/NodeComparisonTable'
import StructuredDiff from '../components/StructuredDiff'

export default function OverviewTab({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const { nodes } = computeDiffs(runA, runB)
  const summaryMetrics = computeSummaryMetrics(runA, runB)
  const impact = computeChangeImpact(nodes)
  const keyChanges = computeKeyChanges(nodes)

  return (
    <div className="space-y-2.5 py-2.5">
      {/* Summary Metrics */}
      <SummaryMetrics metrics={summaryMetrics} />

      {/* Main compare layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
        <div className="lg:col-span-7 flex flex-col gap-2.5">
          <PipelineComparison runA={runA} runB={runB} diffs={nodes} />
          <NodeComparisonTable diffs={nodes} />
        </div>
        <div className="lg:col-span-5 flex flex-col gap-2.5">
          <div className="card rounded-xl p-3.5">
            <div className="min-w-0">
              <h3 className="text-[13px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Key Changes Summary</h3>
              <KeyChangesSummary changes={keyChanges} compact />
            </div>
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <h3 className="text-[13px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Change Impact</h3>
              <ChangeImpactChart impact={impact} compact />
            </div>
          </div>
          <StructuredDiff diffs={nodes} />
        </div>
      </div>

      {/* Info banner */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px]"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.1"/>
          <path d="M7 4.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <circle cx="7" cy="9.5" r="0.6" fill="currentColor"/>
        </svg>
        Comparison shows differences between base run (failed) and replay run. Use &quot;Replay from diff&quot; to create a new run starting from the first differing node.
      </div>
    </div>
  )
}
