'use client'

export type TabId = 'overview' | 'node-comparison' | 'diff-view' | 'metrics' | 'ai-analysis' | 'timeline' | 'logs'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '\u25CB' },
  { id: 'node-comparison', label: 'Node Comparison', icon: '\u2630' },
  { id: 'diff-view', label: 'Diff View', icon: '\u2194' },
  { id: 'metrics', label: 'Metrics', icon: '\u2593' },
  { id: 'ai-analysis', label: 'AI Analysis', icon: '\u2605' },
  { id: 'timeline', label: 'Execution Timeline', icon: '\u23F1' },
  { id: 'logs', label: 'Logs Comparison', icon: '\u25C9' },
]

export default function CompareTabNav({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <div
      className="flex items-center gap-0 overflow-x-auto"
      style={{ borderBottom: '2px solid var(--border-subtle)' }}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors relative"
            style={{
              color: isActive ? '#6366f1' : 'var(--text-muted)',
              fontWeight: isActive ? 700 : 500,
            }}
          >
            <span className="text-[12px]">{tab.icon}</span>
            {tab.label}
            {isActive && (
              <span
                className="absolute bottom-[-2px] left-0 right-0 h-[2px]"
                style={{ background: '#6366f1' }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
