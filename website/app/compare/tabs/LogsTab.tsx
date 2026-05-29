'use client'

export default function LogsTab() {
  return (
    <div className="py-16 text-center">
      <div className="text-[24px] mb-2" style={{ color: 'var(--text-faint)' }}>{'\u25C9'}</div>
      <p className="text-[13px] font-medium" style={{ color: 'var(--text-muted)' }}>Logs comparison coming soon.</p>
      <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
        Side-by-side CLI log output will be available in a future release.
      </p>
    </div>
  )
}
