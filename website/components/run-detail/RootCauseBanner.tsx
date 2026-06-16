'use client'

export default function RootCauseBanner({ chain }: { chain: string[] }) {
  if (chain.length === 0) return null

  return (
    <div
      className="rounded-[10px] px-5 py-4"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--failure) 6%, transparent)',
        border: '1px solid color-mix(in srgb, var(--failure) 25%, transparent)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--failure)' }}>
          Root Cause
        </span>
        <span className="font-mono text-[13px] font-bold" style={{ color: 'var(--failure)' }}>
          {chain.join('  \u2192  ')}
        </span>
      </div>
    </div>
  )
}
