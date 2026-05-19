'use client'

export default function RootCauseBanner({ chain }: { chain: string[] }) {
  if (chain.length === 0) return null

  return (
    <div
      className="rounded-xl px-5 py-4"
      style={{
        background: 'rgba(239,68,68,0.04)',
        border: '1px solid rgba(239,68,68,0.15)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: '#ef4444' }}>
          Root Cause
        </span>
        <span className="font-mono text-[13px] font-bold" style={{ color: '#dc2626' }}>
          {chain.join('  \u2192  ')}
        </span>
      </div>
    </div>
  )
}
