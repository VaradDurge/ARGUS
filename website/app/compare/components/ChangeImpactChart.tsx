'use client'

import type { ChangeImpact } from '../lib/compare-utils'

export default function ChangeImpactChart({ impact, compact = false }: { impact: ChangeImpact; compact?: boolean }) {
  const total = impact.positive + impact.negative + impact.unchanged
  if (total === 0) return null

  const radius = compact ? 38 : 70
  const stroke = compact ? 10 : 18
  const circumference = 2 * Math.PI * radius
  const center = radius + stroke / 2 + 4

  const posLen = (impact.positive / 100) * circumference
  const negLen = (impact.negative / 100) * circumference
  const uncLen = (impact.unchanged / 100) * circumference

  const posOffset = 0
  const negOffset = posLen
  const uncOffset = posLen + negLen

  const segments = [
    { len: posLen, offset: posOffset, color: '#3d9e7d' },
    { len: negLen, offset: negOffset, color: '#d65c5c' },
    { len: uncLen, offset: uncOffset, color: '#3a3f4c' },
  ].filter((s) => s.len > 0)

  const dominantPct = Math.max(impact.positive, impact.negative, impact.unchanged)
  const dominantLabel =
    dominantPct === impact.positive ? 'Positive Impact'
    : dominantPct === impact.negative ? 'Negative Impact'
    : 'No Change'

  return (
    <div className={`flex items-center ${compact ? 'gap-3' : 'gap-5'}`}>
      {/* Donut */}
      <div className="relative shrink-0" style={{ width: center * 2, height: center * 2 }}>
        <svg width={center * 2} height={center * 2} viewBox={`0 0 ${center * 2} ${center * 2}`}>
          {/* Background ring */}
          <circle
            cx={center} cy={center} r={radius}
            fill="none" stroke="#1f2129" strokeWidth={stroke}
          />
          {/* Segments */}
          {segments.map((seg, i) => (
            <circle
              key={i}
              cx={center} cy={center} r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${seg.len} ${circumference - seg.len}`}
              strokeDashoffset={-seg.offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${center} ${center})`}
            />
          ))}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${compact ? 'text-[14px]' : 'text-[18px]'} font-bold`} style={{ color: 'var(--text-primary)' }}>
            {dominantPct}%
          </span>
          <span className={`${compact ? 'text-[8.5px]' : 'text-[10px]'} font-medium`} style={{ color: 'var(--text-muted)' }}>
            {dominantLabel}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className={compact ? 'flex flex-col gap-1.5' : 'flex flex-col gap-2'}>
        <div className="flex items-center gap-2">
          <span className={`${compact ? 'w-2 h-2' : 'w-3 h-3'} rounded-full shrink-0`} style={{ background: '#3d9e7d' }} />
          <span className={`${compact ? 'text-[11px]' : 'text-[12px]'} font-medium`} style={{ color: 'var(--text-secondary)' }}>Positive</span>
          <span className={`${compact ? 'text-[11px]' : 'text-[12px]'} font-bold`} style={{ color: 'var(--text-primary)' }}>{impact.positive}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`${compact ? 'w-2 h-2' : 'w-3 h-3'} rounded-full shrink-0`} style={{ background: '#3a3f4c' }} />
          <span className={`${compact ? 'text-[11px]' : 'text-[12px]'} font-medium`} style={{ color: 'var(--text-secondary)' }}>No Change</span>
          <span className={`${compact ? 'text-[11px]' : 'text-[12px]'} font-bold`} style={{ color: 'var(--text-primary)' }}>{impact.unchanged}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`${compact ? 'w-2 h-2' : 'w-3 h-3'} rounded-full shrink-0`} style={{ background: '#d65c5c' }} />
          <span className={`${compact ? 'text-[11px]' : 'text-[12px]'} font-medium`} style={{ color: 'var(--text-secondary)' }}>Negative</span>
          <span className={`${compact ? 'text-[11px]' : 'text-[12px]'} font-bold`} style={{ color: 'var(--text-primary)' }}>{impact.negative}%</span>
        </div>
      </div>
    </div>
  )
}
