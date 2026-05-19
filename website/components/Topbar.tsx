'use client'

import { usePathname } from 'next/navigation'

function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'Runs'
  if (pathname === '/compare') return 'Compare'
  if (pathname === '/guide') return 'Guide'
  if (pathname.startsWith('/runs/')) return 'Run Detail'
  return 'ARGUS'
}

export default function Topbar() {
  const pathname = usePathname()
  const title = getPageTitle(pathname)

  return (
    <header
      className="h-11 flex items-center justify-between px-8 shrink-0"
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <span className="text-[12px] font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </span>
      <div className="flex items-center gap-3">
        <span
          className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded-md tracking-wide"
          style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10b981' }} />
          local
        </span>
      </div>
    </header>
  )
}
