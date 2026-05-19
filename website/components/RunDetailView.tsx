'use client'

import Link from 'next/link'
import type { RunRecord } from '@/lib/types'
import JsonViewer from './JsonViewer'
import RunHeader from './run-detail/RunHeader'
import RootCauseBanner from './run-detail/RootCauseBanner'
import AIAnalysisPanel from './run-detail/AIAnalysisPanel'
import MetricsGrid from './run-detail/MetricsGrid'
import ExecutionTimeline from './run-detail/ExecutionTimeline'
import CorrelationPanel from './run-detail/CorrelationPanel'
import BehaviorPanel from './run-detail/BehaviorPanel'
import ReplayControls from './run-detail/ReplayControls'

export default function RunDetailView({ run }: { run: RunRecord }) {
  return (
    <div className="max-w-5xl">
      {/* Back nav */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12px] transition-colors hover:text-[var(--text-secondary)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M6.5 2L3.5 5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          All runs
        </Link>
      </div>

      <ReplayControls runId={run.run_id}>
        {(handleReplay) => (
          <div className="space-y-8">
            {/* 1. Run header with status, metadata, actions */}
            <RunHeader run={run} />

            {/* 2. Root cause banner */}
            {run.root_cause_chain && run.root_cause_chain.length > 0 && (
              <RootCauseBanner chain={run.root_cause_chain} />
            )}

            {/* 3. Metrics grid */}
            <MetricsGrid run={run} />

            {/* 4. Execution timeline — terminal-inspired */}
            <ExecutionTimeline run={run} onReplay={handleReplay} />

            {/* 5. AI Analysis */}
            <AIAnalysisPanel run={run} />

            {/* 6. Correlation panel */}
            <CorrelationPanel run={run} />

            {/* 7. Behavior panel (collapsible) */}
            <BehaviorPanel run={run} />

            {/* 8. Initial state */}
            {run.initial_state && Object.keys(run.initial_state).length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                  Initial State
                </div>
                <JsonViewer data={run.initial_state} defaultCollapsed={true} />
              </div>
            )}
          </div>
        )}
      </ReplayControls>
    </div>
  )
}
