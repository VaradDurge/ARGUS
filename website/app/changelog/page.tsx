'use client'

const serif = { fontFamily: "'Georgia', 'Times New Roman', serif" }

interface Release {
  version: string
  title: string
  date: string
  tag: 'major' | 'minor' | 'patch' | 'beta'
  highlights: string[]
  details?: string[]
}

const RELEASES: Release[] = [
  {
    version: '0.4.0',
    title: 'Beta Testing Rollout',
    date: '2026-05-17',
    tag: 'beta',
    highlights: [
      'LLM token/cost tracking — auto-extracts usage from node outputs, shows cost per node and total',
      'Redesigned sidebar into Observe / Analyze sections',
      'Replay from subdirectories — runs recorded from child folders are now found and replayable',
      'Changelog page with full version timeline',
      'Report the Dev page for bug reports and feature requests',
      'Restored and expanded test suite',
    ],
  },
  {
    version: '0.3.10',
    title: 'Replay wired to UI',
    date: '2026-05-06',
    tag: 'minor',
    highlights: [
      'Replay from UI — hover any step, click "replay from here", no CLI needed',
      'App factory input persists to .argus/config.json automatically',
      'Auto-compare after replay — navigates to diff view showing original vs replay',
      'Eval metrics panel in compare page (failure count, severity, success rate)',
      '--app flag on argus ui for startup config',
    ],
  },
  {
    version: '0.3.7',
    title: 'Auto-login & interrupt stitching',
    date: '2026-05-04',
    tag: 'minor',
    highlights: [
      'Auto-login in argus ui — reads CLI credentials, no second OAuth flow',
      'Interrupted runs + resume continuations stitched into a single merged view',
      'Resume runs hidden from top-level list to avoid duplicates',
    ],
  },
  {
    version: '0.3.5',
    title: 'Cloud storage',
    date: '2026-05-04',
    tag: 'minor',
    highlights: [
      'Google login and Supabase cloud storage',
      'Background sync of runs to cloud',
    ],
  },
  {
    version: '0.3.3',
    title: 'Web Dashboard',
    date: '2026-04-27',
    tag: 'major',
    highlights: [
      'argus ui — web dashboard served by a pure-Python HTTP server, no Node.js required',
      'Runs list with status, duration, pass rate stats',
      'Per-run detail view with step-by-step inspection',
      'Side-by-side run comparison at /compare',
      'Zero extra dependencies — just Python',
    ],
  },
  {
    version: '0.3.2',
    title: 'Silent failure enhancements',
    date: '2026-04-22',
    tag: 'patch',
    highlights: [
      'Strict mode for inspector',
      'Nested error scan in tool outputs',
      'Generic list type checking',
    ],
  },
  {
    version: '0.3.0',
    title: 'Parallel Execution',
    date: '2026-04-19',
    tag: 'major',
    highlights: [
      'Parallel nodes grouped in a parallel panel in argus show',
      'Graph topology diagram above the step list',
      'Silent failure detection is parallel-aware — only blames nodes for fields they wrote',
      'Root cause chain excludes innocent parallel siblings',
    ],
  },
  {
    version: '0.2.2',
    title: 'Run Differentiator',
    date: '2026-04-18',
    tag: 'minor',
    highlights: [
      'argus diff — compare any two runs node-by-node',
      'Status changes with FIXED / REGRESSION labels',
      'Inspection diff, validator result flips, output field deltas',
      'Frozen node and duration change tracking',
    ],
  },
  {
    version: '0.2.1',
    title: 'Tool Call Failure Detection',
    date: '2026-04-14',
    tag: 'minor',
    highlights: [
      'Detects error_response, rate_limit (HTTP 429), and empty_result from tool calls',
      'Tool failures show inline under the node that swallowed them',
    ],
  },
  {
    version: '0.1.1',
    title: 'Deterministic Replay',
    date: '2026-04-10',
    tag: 'minor',
    highlights: [
      'Replay plays back exact outputs from the original run — no live LLM calls',
      'Reproducible replays with zero configuration',
    ],
  },
  {
    version: '0.1.0',
    title: 'MVP',
    date: '2026-04-02',
    tag: 'major',
    highlights: [
      'Core monitoring: ArgusWatcher for LangGraph, ArgusSession for any framework',
      'Silent failure detection: missing fields, type mismatches, empty outputs',
      'Semantic signature registry for placeholder/degraded LLM outputs',
      'Root cause analysis chain',
      'CLI: argus show, argus replay',
      'Local storage in .argus/runs/',
    ],
  },
]

const TAG_STYLES: Record<Release['tag'], { bg: string; text: string; label: string }> = {
  beta: { bg: 'rgba(99,102,241,0.1)', text: '#6366f1', label: 'BETA' },
  major: { bg: 'rgba(16,185,129,0.1)', text: '#10b981', label: 'MAJOR' },
  minor: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b', label: 'MINOR' },
  patch: { bg: 'rgba(156,163,175,0.1)', text: '#9ca3af', label: 'PATCH' },
}

function ReleaseBadge({ tag }: { tag: Release['tag'] }) {
  const s = TAG_STYLES[tag]
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md tracking-wider"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  )
}

export default function ChangelogPage() {
  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-10">
        <h1
          className="text-[28px] font-bold tracking-tight mb-2"
          style={{ ...serif, color: 'var(--text-primary)' }}
        >
          Changelog
        </h1>
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          What&apos;s new in each version of ARGUS.
        </p>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div
          className="absolute left-[7px] top-3 bottom-3 w-[1.5px]"
          style={{ background: 'var(--border-subtle)' }}
        />

        <div className="flex flex-col gap-0">
          {RELEASES.map((r, i) => (
            <div key={r.version} className="relative pl-8 pb-8 group">
              {/* Dot on timeline */}
              <div
                className="absolute left-0 top-[6px] w-[15px] h-[15px] rounded-full border-2 flex items-center justify-center"
                style={{
                  borderColor: i === 0 ? '#6366f1' : 'var(--border-subtle)',
                  background: i === 0 ? '#6366f1' : 'var(--card-bg)',
                }}
              >
                {i === 0 && (
                  <div className="w-[5px] h-[5px] rounded-full bg-white" />
                )}
              </div>

              {/* Version header */}
              <div className="flex items-center gap-2.5 mb-2">
                <span
                  className="text-[16px] font-bold tracking-tight"
                  style={{ ...serif, color: 'var(--text-primary)' }}
                >
                  v{r.version}
                </span>
                <ReleaseBadge tag={r.tag} />
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {r.date}
                </span>
              </div>

              {/* Title */}
              <p
                className="text-[14px] font-medium mb-2.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                {r.title}
              </p>

              {/* Highlights */}
              <ul className="flex flex-col gap-1.5">
                {r.highlights.map((h, j) => (
                  <li key={j} className="flex gap-2 text-[12.5px] leading-relaxed">
                    <span className="shrink-0 mt-[3px]" style={{ color: 'var(--text-muted)' }}>
                      &bull;
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
