'use client'

import type { ChangeImpact } from '../lib/compare-utils'

const RADIUS = 70
const STROKE = 18
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const CENTER = RADIUS + STROKE / 2 + 4

export default function ChangeImpactChart({ impact }: { impact: ChangeImpact }) {
  const total = impact.positive + impact.negative + impact.unchanged
  if (total === 0) return null

  const posLen = (impact.positive / 100) * CIRCUMFERENCE
  const negLen = (impact.negative / 100) * CIRCUMFERENCE
  const uncLen = (impact.unchanged / 100) * CIRCUMFERENCE

  const posOffset = 0
  const negOffset = posLen
  const uncOffset = posLen + negLen

  const segments = [
    { len: posLen, offset: posOffset, color: '#10b981' },
    { len: negLen, offset: negOffset, color: '#ef4444' },
    { len: uncLen, offset: uncOffset, color: '#d1d5db' },
  ].filter((s) => s.len > 0)

  const dominantPct = Math.max(impact.positive, impact.negative, impact.unchanged)
  const dominantLabel =
    dominantPct === impact.positive ? 'Positive Impact'
    : dominantPct === impact.negative ? 'Negative Impact'
    : 'No Change'

  return (
    <div className="flex items-center gap-5">
      {/* Donut */}
      <div className="relative shrink-0" style={{ width: CENTER * 2, height: CENTER * 2 }}>
        <svg width={CENTER * 2} height={CENTER * 2} viewBox={`0 0 ${CENTER * 2} ${CENTER * 2}`}>
          {/* Background ring */}
          <circle
            cx={CENTER} cy={CENTER} r={RADIUS}
            fill="none" stroke="#e5e7eb" strokeWidth={STROKE}
          />
          {/* Segments */}
          {segments.map((seg, i) => (
            <circle
              key={i}
              cx={CENTER} cy={CENTER} r={RADIUS}
              fill="none"
              stroke={seg.color}
              strokeWidth={STROKE}
              strokeDasharray={`${seg.len} ${CIRCUMFERENCE - seg.len}`}
              strokeDashoffset={-seg.offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
            />
          ))}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
            {dominantPct}%
          </span>
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
            {dominantLabel}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#10b981' }} />
          <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Positive</span>
          <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{impact.positive}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#d1d5db' }} />
          <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>No Change</span>
          <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{impact.unchanged}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#ef4444' }} />
          <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Negative</span>
          <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{impact.negative}%</span>
        </div>
      </div>
    </div>
  )
}
