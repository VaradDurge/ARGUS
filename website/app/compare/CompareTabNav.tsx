'use client'

export type TabId = 'overview' | 'node-comparison' | 'diff-view' | 'metrics' | 'ai-analysis' | 'timeline' | 'logs'

const TABS: { id: TabId; label: string; icon: JSX.Element }[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2"/><circle cx="6.5" cy="6.5" r="2" fill="currentColor"/></svg>,
  },
  {
    id: 'node-comparison',
    label: 'Node Comparison',
    icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="3.5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1"/><circle cx="9.5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1"/><circle cx="3.5" cy="9.5" r="2" stroke="currentColor" strokeWidth="1"/><circle cx="9.5" cy="9.5" r="2" stroke="currentColor" strokeWidth="1"/></svg>,
  },
  {
    id: 'diff-view',
    label: 'Diff View',
    icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="4.5" height="11" rx="1" stroke="currentColor" strokeWidth="1"/><rect x="7.5" y="1" width="4.5" height="11" rx="1" stroke="currentColor" strokeWidth="1"/></svg>,
  },
  {
    id: 'metrics',
    label: 'Metrics',
    icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="7" width="2.5" height="5" rx="0.5" fill="currentColor"/><rect x="5.25" y="4" width="2.5" height="8" rx="0.5" fill="currentColor"/><rect x="9.5" y="1" width="2.5" height="11" rx="0.5" fill="currentColor"/></svg>,
  },
  {
    id: 'ai-analysis',
    label: 'AI Analysis',
    icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1l1.3 3.2L11 5.5l-3.2 1.3L6.5 10 5.2 6.8 2 5.5l3.2-1.3z" fill="currentColor"/><circle cx="10" cy="2.5" r="1" fill="currentColor"/><circle cx="3" cy="10" r="0.8" fill="currentColor"/></svg>,
  },
  {
    id: 'timeline',
    label: 'Execution Timeline',
    icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="2" width="7" height="2" rx="0.5" fill="currentColor"/><rect x="1" y="5.5" width="10" height="2" rx="0.5" fill="currentColor"/><rect x="1" y="9" width="5" height="2" rx="0.5" fill="currentColor"/></svg>,
  },
  {
    id: 'logs',
    label: 'Logs Comparison',
    icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="1.5" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1"/><path d="M4 5h5M4 7h3.5M4 9h4.5" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/></svg>,
  },
]

export default function CompareTabNav({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <div
      className="flex items-center gap-0 overflow-x-auto"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] whitespace-nowrap shrink-0 transition-colors relative"
            style={{
              color: isActive ? 'var(--foreground)' : 'var(--text-tertiary)',
              fontWeight: isActive ? 600 : 400,
            }}
          >
            {tab.icon}
            {tab.label}
            {isActive && (
              <span
                className="absolute bottom-[-1px] left-0 right-0 h-[2px] rounded-full"
                style={{ background: 'var(--primary)' }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
