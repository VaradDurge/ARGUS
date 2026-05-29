'use client'

import type { KeyChange } from '../lib/compare-utils'

const ICONS: Record<string, { icon: string; color: string }> = {
  improved:  { icon: '\u2713', color: '#10b981' },
  degraded:  { icon: '\u2717', color: '#ef4444' },
  unchanged: { icon: '\u2014', color: '#9ca3af' },
}

export default function KeyChangesSummary({ changes }: { changes: KeyChange[] }) {
  return (
    <div className="space-y-2">
      {changes.map((c) => {
        const vis = ICONS[c.type] ?? ICONS.unchanged
        return (
          <div key={c.nodeName} className="flex items-start gap-2.5">
            <span
              className="text-[14px] font-bold shrink-0 w-5 text-center mt-0.5"
              style={{ color: vis.color }}
            >
              {vis.icon}
            </span>
            <div className="min-w-0">
              <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                {c.nodeName}:
              </span>
              <span className="text-[13px] ml-1" style={{ color: 'var(--text-secondary)' }}>
                {c.description}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
