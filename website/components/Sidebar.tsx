'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'

// ── Icons ──────────────────────────────────────────────────────────────────

function IconRuns() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="2" width="5" height="3.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="1.5" y="7.5" width="5" height="3.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="9" y="2" width="5.5" height="12" rx="0.8" stroke="currentColor" strokeWidth="1.2" fill="none"/>
    </svg>
  )
}

function IconTraces() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 4h10M3 8h7M3 12h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="13" cy="8" r="1.2" fill="currentColor"/>
      <circle cx="10" cy="12" r="1.2" fill="currentColor"/>
    </svg>
  )
}

function IconCompare() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 2v12M11 2v12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M1.5 8h13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 2"/>
    </svg>
  )
}

function IconPatterns() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 8h3M6.5 4.5h3M10.5 8h3M6.5 11.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="5.5" cy="8" r="1.2" stroke="currentColor" strokeWidth="1"/>
      <circle cx="9.5" cy="4.5" r="1.2" stroke="currentColor" strokeWidth="1"/>
      <circle cx="10.5" cy="8" r="1.2" stroke="currentColor" strokeWidth="1"/>
      <circle cx="9.5" cy="11.5" r="1.2" stroke="currentColor" strokeWidth="1"/>
    </svg>
  )
}

function IconApprovals() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <path d="M5.5 7l1.8 1.8 3.2-3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 11h6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
}

function IconEval() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5.5 8l1.5 1.5 3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconGuide() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 2.5h8a1.5 1.5 0 011.5 1.5v8a1.5 1.5 0 01-1.5 1.5H3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 2.5v11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M6 6h3.5M6 8.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function IconChangelog() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 4.5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconReport() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 2.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11z" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 5.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="8" cy="10.5" r="0.7" fill="currentColor"/>
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1.06 1.06M11.14 11.14l1.06 1.06M3.8 12.2l1.06-1.06M11.14 4.86l1.06-1.06" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 2.5H4a1.5 1.5 0 00-1.5 1.5v8A1.5 1.5 0 004 13.5h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M10.5 5L13.5 8l-3 3M6.5 8H13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconGraphs() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="8" cy="12" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5.5 5.5L7 10.5M10.5 5.5L9 10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

function IconAlerts() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 2a4.5 4.5 0 00-4.5 4.5v3L2 11.5h12l-1.5-2V6.5A4.5 4.5 0 008 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M6.5 11.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function IconDatasets() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="8" cy="4.5" rx="5" ry="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M3 4.5v3.5c0 1.1 2.24 2 5 2s5-.9 5-2V4.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M3 8v3.5c0 1.1 2.24 2 5 2s5-.9 5-2V8" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 pt-5 pb-1.5">
      <span
        className="text-[10px] uppercase tracking-[0.12em] font-semibold"
        style={{ color: 'var(--sidebar-muted)' }}
      >
        {label}
      </span>
    </div>
  )
}

function NavLink({
  href,
  icon,
  label,
  exact,
}: {
  href: string
  icon: React.ReactNode
  label: string
  exact: boolean
}) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname.startsWith(href)

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="nav-item flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] relative group"
      style={{
        background: active ? 'var(--sidebar-active)' : 'transparent',
        color: active ? '#7c7fc7' : 'var(--sidebar-text)',
        fontWeight: active ? 700 : 600,
      }}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
          style={{ background: '#7c7fc7' }}
        />
      )}
      <span className="shrink-0" style={{ color: active ? '#7c7fc7' : 'var(--sidebar-muted)' }}>
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  )
}

function SoonItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] cursor-not-allowed select-none">
      <div className="flex items-center gap-3">
        <span className="shrink-0" style={{ color: '#3a3f4c' }}>{icon}</span>
        <span style={{ color: '#3a3f4c' }}>{label}</span>
      </div>
      <span
        className="text-[9px] px-1.5 py-0.5 rounded-md font-medium"
        style={{ color: '#5d6370', background: '#1c1d24', letterSpacing: '0.05em' }}
      >
        soon
      </span>
    </div>
  )
}

function Divider() {
  return <div className="my-1.5 mx-3" style={{ height: '1px', background: 'var(--border-subtle)' }} />
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Sidebar() {
  const { user, signOut } = useAuth()

  const initials = user?.user_metadata?.full_name
    ? (user.user_metadata.full_name as string)
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? '?'

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined

  return (
    <aside
      className="w-56 shrink-0 flex flex-col h-screen sticky top-0"
      style={{
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* Brand */}
      <div
        className="px-4 py-4 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <svg width="20" height="20" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 1.5L16.5 5.5V12.5L9 16.5L1.5 12.5V5.5L9 1.5Z" stroke="#7c7fc7" strokeWidth="1.2" fill="none"/>
          <circle cx="9" cy="9" r="2.2" fill="rgba(124,127,199,0.15)" stroke="#7c7fc7" strokeWidth="1.1"/>
          <circle cx="9" cy="9" r="0.9" fill="#7c7fc7"/>
        </svg>
        <span className="text-[15px] font-extrabold tracking-[-0.035em]" style={{ color: 'var(--text-primary)' }}>
          ARGUS
        </span>
        <span
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md ml-0.5"
          style={{ color: '#7c7fc7', background: 'rgba(124,127,199,0.08)', letterSpacing: '0.05em' }}
        >
          BETA
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col p-2 flex-1 overflow-y-auto">

        <SectionLabel label="Observe" />
        <NavLink href="/" icon={<IconRuns />} label="Runs" exact={true} />
        <SoonItem icon={<IconTraces />} label="Traces" />

        <Divider />

        <SectionLabel label="Analyze" />
        <NavLink href="/compare" icon={<IconCompare />} label="Compare" exact={false} />
        <NavLink href="/patterns" icon={<IconPatterns />} label="Patterns" exact={true} />
        <NavLink href="/approvals" icon={<IconApprovals />} label="Approvals" exact={true} />
        <SoonItem icon={<IconEval />} label="Evaluation" />

        <Divider />

        <SectionLabel label="Workflows" />
        <SoonItem icon={<IconGraphs />} label="Graphs" />
        <SoonItem icon={<IconAlerts />} label="Alerts" />
        <SoonItem icon={<IconDatasets />} label="Datasets" />

        <div className="flex-1" />

        <Divider />

        <NavLink href="/guide" icon={<IconGuide />} label="Guide" exact={true} />
        <NavLink href="/changelog" icon={<IconChangelog />} label="Changelog" exact={true} />
        <NavLink href="/report" icon={<IconReport />} label="Report Board" exact={true} />
        <SoonItem icon={<IconSettings />} label="Settings" />

      </nav>

      {/* User footer */}
      <div
        className="px-3 py-3 flex items-center justify-between gap-2"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        {user ? (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              {avatarUrl ? (
                <Image src={avatarUrl} alt="" width={24} height={24} className="rounded-full shrink-0" />
              ) : (
                <div
                  className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
                  style={{ background: '#7c7fc7', color: '#fff' }}
                >
                  {initials}
                </div>
              )}
              <span className="text-[12px] truncate" style={{ color: 'var(--text-secondary)' }}>
                {user.user_metadata?.full_name ?? user.email}
              </span>
            </div>
            <button
              onClick={signOut}
              className="shrink-0 p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Sign out"
            >
              <IconLogout />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: '#3d9e7d', boxShadow: '0 0 4px rgba(61,158,125,0.4)' }}
            />
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Connected</span>
          </div>
        )}
      </div>
    </aside>
  )
}
