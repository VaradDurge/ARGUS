'use client'

import type { RunRecord } from '@/lib/types'

export default function AIAnalysisTab({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const invA = runA.llm_investigation
  const invB = runB.llm_investigation

  if (!invA?.triggered && !invB?.triggered) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No AI analysis available for these runs.</p>
      </div>
    )
  }

  return (
    <div className="py-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Run A */}
      <div className="card rounded-xl p-4">
        <h3 className="text-[13px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Base Run Analysis</h3>
        {invA?.triggered ? (
          <div className="space-y-2">
            {invA.root_cause_explanation && (
              <p className="text-[12px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {invA.root_cause_explanation}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Confidence:</span>
              <span className="text-[13px] font-bold" style={{ color: invA.confidence >= 0.75 ? '#10b981' : invA.confidence >= 0.45 ? '#f59e0b' : '#9ca3af' }}>
                {Math.round(invA.confidence * 100)}%
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No analysis triggered.</p>
        )}
      </div>

      {/* Run B */}
      <div className="card rounded-xl p-4">
        <h3 className="text-[13px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Replay Analysis</h3>
        {invB?.triggered ? (
          <div className="space-y-2">
            {invB.root_cause_explanation && (
              <p className="text-[12px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {invB.root_cause_explanation}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Confidence:</span>
              <span className="text-[13px] font-bold" style={{ color: invB.confidence >= 0.75 ? '#10b981' : invB.confidence >= 0.45 ? '#f59e0b' : '#9ca3af' }}>
                {Math.round(invB.confidence * 100)}%
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No analysis triggered.</p>
        )}
      </div>
    </div>
  )
}
