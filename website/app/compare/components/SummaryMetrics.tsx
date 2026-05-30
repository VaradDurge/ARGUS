'use client'

import type { SummaryMetric } from '../lib/compare-utils'

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'neutral' }) {
  if (trend === 'neutral') return null
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
      {trend === 'up' ? (
        <path d="M5 2v6M2.5 4.5L5 2l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      ) : (
        <path d="M5 8V2M2.5 5.5L5 8l2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      )}
    </svg>
  )
}

export default function SummaryMetrics({ metrics }: { metrics: SummaryMetric[] }) {
  return (
    <div
      className="grid grid-cols-3 lg:grid-cols-6 gap-0 rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      {metrics.map((m, i) => (
        <div
          key={m.label}
          className="px-4 py-3.5 flex flex-col gap-1"
          style={{
            borderRight: i < metrics.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          }}
        >
          <div className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
            {m.label}
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="text-[16px] font-bold tracking-[-0.02em]"
              style={{ color: 'var(--text-primary)' }}
            >
              {m.displayValue}
            </span>
            {m.delta && (
              <span
                className="text-[11px] font-semibold flex items-center gap-0.5"
                style={{ color: m.color }}
              >
                <TrendArrow trend={m.trend} />
                {m.delta}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
