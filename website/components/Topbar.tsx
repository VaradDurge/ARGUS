'use client'

import { usePathname } from 'next/navigation'

function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'Runs'
  if (pathname === '/compare') return 'argus diff'
  if (pathname.startsWith('/runs/')) return 'Run'
  return 'ARGUS'
}

export default function Topbar() {
  const pathname = usePathname()
  const title = getPageTitle(pathname)

  return (
    <header
      className="h-9 flex items-center justify-between px-6 shrink-0"
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(11,11,13,0.9)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <span className="text-[11px] font-mono tracking-wide" style={{ color: 'var(--text-faint)' }}>
        {title}
      </span>
      <span
        className="text-[9px] font-mono px-1.5 py-0.5 rounded tracking-widest uppercase"
        style={{ color: 'var(--text-faint)', border: '1px solid var(--border-subtle)' }}
      >
        local
      </span>
    </header>
  )
}
