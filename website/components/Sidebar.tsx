'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'

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

function IconReplay() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2.5a4.5 4.5 0 1 1-3.18 1.32" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M3 2.5V5.5H6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
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

function IconLogout() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M9 4l3 3-3 3M5.5 7H12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 pt-3 pb-1">
      <span
        className="text-[9px] uppercase tracking-[0.14em] font-semibold"
        style={{ color: 'var(--text-faint)' }}
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
      className="nav-item flex items-center gap-2.5 px-3 py-2 rounded-md text-xs relative group border"
      style={{
        background: active ? 'rgba(59,130,246,0.10)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        borderColor: active ? 'rgba(59,130,246,0.22)' : 'transparent',
      }}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
          style={{ background: '#3b82f6' }}
        />
      )}
      <span className="pl-1 shrink-0" style={{ color: active ? '#3b82f6' : 'var(--text-muted)' }}>
        {icon}
      </span>
      <span className="font-medium">{label}</span>
    </Link>
  )
}

function SoonItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md text-xs cursor-not-allowed select-none">
      <div className="flex items-center gap-2.5">
        <span className="pl-1 shrink-0" style={{ color: '#2a2a30' }}>{icon}</span>
        <span style={{ color: '#333339' }}>{label}</span>
      </div>
      <span
        className="text-[9px] px-1 py-0.5 rounded"
        style={{ color: '#3a3a40', border: '1px solid var(--border-subtle)', letterSpacing: '0.05em' }}
      >
        soon
      </span>
    </div>
  )
}

function Divider() {
  return <div className="my-1 mx-3" style={{ height: '1px', background: 'var(--border-subtle)' }} />
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
      className="w-52 shrink-0 flex flex-col h-screen sticky top-0"
      style={{
        background: 'rgba(11,11,13,0.97)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* Brand */}
      <div
        className="px-4 py-3.5 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <IconArgus />
        <span className="text-[13px] font-semibold tracking-tight text-white">ARGUS</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col p-2 flex-1 overflow-y-auto">

        <SectionLabel label="Observe" />
        <NavLink href="/" icon={<IconRuns />} label="Runs" exact={true} />
        <SoonItem icon={<IconReplay />} label="Replay" />

        <Divider />

        <SectionLabel label="Analyze" />
        <NavLink href="/compare" icon={<IconCompare />} label="Compare" exact={false} />
        <SoonItem icon={<IconEval />} label="Evaluation" />

        <div className="flex-1" />

        <Divider />

        <SectionLabel label="Settings" />
        <SoonItem icon={<IconSettings />} label="Settings" />

      </nav>

      {/* User footer */}
      <div
        className="px-3 py-2.5 flex items-center justify-between gap-2"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        {user ? (
          <>
            <div className="flex items-center gap-2 min-w-0">
              {avatarUrl ? (
                <Image src={avatarUrl} alt="" width={20} height={20} className="rounded-full shrink-0" />
              ) : (
                <div
                  className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold"
                  style={{ background: '#3b82f6', color: '#fff' }}
                >
                  {initials}
                </div>
              )}
              <span className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                {user.user_metadata?.full_name ?? user.email}
              </span>
            </div>
            <button
              onClick={signOut}
              className="shrink-0 p-1.5 rounded hover:bg-white/5 transition-colors"
              style={{ color: 'var(--text-faint)' }}
              title="Sign out"
            >
              <IconLogout />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: '#22c55e', boxShadow: '0 0 4px rgba(34,197,94,0.4)' }}
            />
            <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>connected</span>
          </div>
        )}
      </div>
    </aside>
  )
}
