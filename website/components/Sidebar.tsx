'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ── Icons ──────────────────────────────────────────────────────────────────

function IconRuns() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="5" height="3.5" rx="0.6" stroke="currentColor" strokeWidth="1.1" fill="none"/>
      <rect x="1" y="6.5" width="5" height="3.5" rx="0.6" stroke="currentColor" strokeWidth="1.1" fill="none"/>
      <rect x="8" y="1" width="5" height="12" rx="0.6" stroke="currentColor" strokeWidth="1.1" fill="none"/>
    </svg>
  )
}

function IconCompare() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 2v10M10 2v10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M1 7h12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeDasharray="1.5 1.5"/>
    </svg>
  )
}

function IconEval() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M4.5 7l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M7 1.5v1.2M7 11.3v1.2M1.5 7h1.2M11.3 7h1.2M3.2 3.2l.85.85M9.95 9.95l.85.85M3.2 10.8l.85-.85M9.95 4.05l.85-.85" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

function IconArgus() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 1.5L16.5 5.5V12.5L9 16.5L1.5 12.5V5.5L9 1.5Z" stroke="#3b82f6" strokeWidth="1.2" fill="none"/>
      <circle cx="9" cy="9" r="2.2" fill="#3b82f6" fillOpacity="0.3" stroke="#3b82f6" strokeWidth="1.1"/>
      <circle cx="9" cy="9" r="0.9" fill="#3b82f6"/>
    </svg>
  )
}

// ── Types ──────────────────────────────────────────────────────────────────

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  exact: boolean
}

interface PlaceholderItem {
  label: string
  icon: React.ReactNode
}

// ── Data ───────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { label: 'Runs',   href: '/',        icon: <IconRuns />,   exact: true  },
  { label: 'Compare', href: '/compare', icon: <IconCompare />, exact: false },
]

const PLACEHOLDER_ITEMS: PlaceholderItem[] = [
  { label: 'Evaluation', icon: <IconEval /> },
  { label: 'Settings',   icon: <IconSettings /> },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <aside
      className="w-56 shrink-0 flex flex-col h-screen sticky top-0"
      style={{
        background: 'rgba(13,13,13,0.95)',
        borderRight: '1px solid var(--border-default)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* ── Brand ── */}
      <div
        className="px-4 py-4 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <IconArgus />
        <div className="flex flex-col leading-none">
          <span className="text-[13px] font-semibold tracking-tight text-white">ARGUS</span>
          <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>monitor</span>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="flex flex-col gap-0 p-2.5 flex-1 overflow-y-auto">

        {/* Observe section */}
        <div className="px-2 py-2 mt-1">
          <span
            className="text-[9px] uppercase tracking-[0.12em] font-medium"
            style={{ color: 'var(--text-faint)' }}
          >
            Observe
          </span>
        </div>

        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="nav-item flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs relative group border hover:bg-white/[0.03]"
              style={{
                background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderColor: active ? 'rgba(59,130,246,0.28)' : 'transparent',
                boxShadow: active ? '0 0 18px rgba(59,130,246,0.12)' : 'none',
              }}
            >
              {/* Active bar */}
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                  style={{ background: '#3b82f6', boxShadow: '0 0 6px rgba(59,130,246,0.5)' }}
                />
              )}
              <span
                className="pl-1 shrink-0 transition-colors"
                style={{ color: active ? '#3b82f6' : 'var(--text-muted)' }}
              >
                {item.icon}
              </span>
              <span className="font-medium">{item.label}</span>
            </Link>
          )
        })}

        {/* Divider */}
        <div
          className="mx-2 my-3"
          style={{ height: '1px', background: 'var(--border-subtle)' }}
        />

        {/* Analyze section */}
        <div className="px-2 py-1 mb-1">
          <span
            className="text-[9px] uppercase tracking-[0.12em] font-medium"
            style={{ color: 'var(--text-faint)' }}
          >
            Analyze
          </span>
        </div>

        {PLACEHOLDER_ITEMS.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-xs cursor-not-allowed select-none border"
            style={{ color: '#3a3a3a', borderColor: 'transparent' }}
          >
            <div className="flex items-center gap-2.5">
              <span className="pl-1 shrink-0" style={{ color: '#333333' }}>{item.icon}</span>
              <span>{item.label}</span>
            </div>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{
                color: '#4a4a4a',
                border: '1px solid var(--border-subtle)',
                letterSpacing: '0.05em',
              }}
            >
              soon
            </span>
          </div>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: '#22c55e', boxShadow: '0 0 5px rgba(34,197,94,0.5)' }}
          />
          <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>connected</span>
        </div>
        <span className="text-[10px] font-mono" style={{ color: '#3a3a3a' }}>v0.3.3</span>
      </div>
    </aside>
  )
}
