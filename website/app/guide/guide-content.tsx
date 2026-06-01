'use client'

import Image from 'next/image'
import { useState } from 'react'

// ── Typography ──────────────────────────────────────────────────────────────

const serif = { fontFamily: "'Georgia', 'Times New Roman', serif" }

function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1
      className="text-[32px] font-bold tracking-tight mb-3 leading-tight"
      style={{ ...serif, color: 'var(--text-primary)' }}
    >
      {children}
    </h1>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[22px] font-semibold mt-14 mb-4 leading-snug"
      style={{ ...serif, color: 'var(--text-primary)' }}
    >
      {children}
    </h2>
  )
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-[15px] font-semibold mt-6 mb-2 tracking-wide uppercase"
      style={{ letterSpacing: '0.06em', color: 'var(--text-muted)', fontFamily: 'inherit' }}
    >
      {children}
    </h3>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[15px] leading-[1.75] mb-4"
      style={{ color: 'var(--text-secondary)', fontFamily: "'Georgia', serif" }}
    >
      {children}
    </p>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[13px] leading-relaxed mt-3 italic"
      style={{ color: 'var(--text-muted)', fontFamily: "'Georgia', serif" }}
    >
      {children}
    </p>
  )
}

function Code({ children }: { children: string }) {
  return (
    <code
      className="text-[12.5px] font-mono px-1.5 py-0.5 rounded"
      style={{ background: 'var(--bg-overlay)', color: 'var(--text-primary)' }}
    >
      {children}
    </code>
  )
}

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="my-5 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
      {title && (
        <div
          className="px-4 py-2 text-[11px] font-mono"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}
        >
          {title}
        </div>
      )}
      <pre
        className="px-4 py-3 text-[12.5px] leading-relaxed font-mono overflow-x-auto"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
      >
        {children}
      </pre>
    </div>
  )
}

function Divider() {
  return <div className="my-10" style={{ height: '1px', background: 'var(--border-subtle)' }} />
}

function Screenshot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <div className="my-6">
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
      >
        <Image
          src={src}
          alt={alt}
          width={1200}
          height={700}
          className="w-full h-auto"
          style={{ display: 'block' }}
        />
      </div>
      {caption && (
        <p
          className="text-[12px] mt-2 text-center italic"
          style={{ color: 'var(--text-muted)', fontFamily: "'Georgia', serif" }}
        >
          {caption}
        </p>
      )}
    </div>
  )
}

function StepItem({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 mb-5">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5"
        style={{ background: 'var(--bg-overlay)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
      >
        {n}
      </div>
      <div className="flex-1">
        <p className="text-[14px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</p>
        <div className="text-[14px] leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: "'Georgia', serif" }}>{children}</div>
      </div>
    </div>
  )
}

const FIELD_COLORS = [
  { bg: 'rgba(124,127,199,0.08)', color: '#818cf8', border: 'rgba(124,127,199,0.2)' },   // indigo
  { bg: 'rgba(61,158,125,0.08)', color: '#34d399', border: 'rgba(61,158,125,0.2)' },   // emerald
  { bg: 'rgba(212,154,46,0.08)', color: '#fbbf24', border: 'rgba(212,154,46,0.2)' },   // amber
  { bg: 'rgba(154,109,198,0.08)', color: '#c084fc', border: 'rgba(154,109,198,0.2)' },   // purple
  { bg: 'rgba(59,130,246,0.08)', color: '#60a5fa', border: 'rgba(59,130,246,0.2)' },   // blue
  { bg: 'rgba(236,72,153,0.08)', color: '#f472b6', border: 'rgba(236,72,153,0.2)' },   // pink
]

function FieldRow({ field, description, colorIdx }: { field: string; description: string; colorIdx: number }) {
  const c = FIELD_COLORS[colorIdx % FIELD_COLORS.length]
  return (
    <div className="flex gap-3 mb-2 items-start">
      <span
        className="text-[12px] font-semibold px-2 py-0.5 rounded shrink-0 mt-0.5"
        style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontFamily: 'inherit' }}
      >
        {field}
      </span>
      <span className="text-[13.5px] leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: "'Georgia', serif" }}>
        {description}
      </span>
    </div>
  )
}

function FieldGroup({ items }: { items: { field: string; description: string }[] }) {
  return (
    <div className="mb-4 space-y-2">
      {items.map((item, i) => (
        <FieldRow key={item.field} field={item.field} description={item.description} colorIdx={i} />
      ))}
    </div>
  )
}

const LLM_PROMPT = `Add ARGUS monitoring to my LangGraph pipeline. ARGUS watches every node and catches silent failures, missing fields, and semantic issues.

Install: pip install argus-agents

Then add 3 lines to the file where the graph is built:

from argus import ArgusWatcher

watcher = ArgusWatcher()
watcher.watch(graph)
app = graph.compile()
result = app.invoke(initial_state)
watcher.finalize()

If the graph is already compiled, use watch_compiled() instead:

watcher = ArgusWatcher()
app = watcher.watch_compiled(app)
result = app.invoke(initial_state)
watcher.finalize()

That's it. Run the pipeline, then use "argus show last" to see what ARGUS caught.

Optional parameters — all go in ArgusWatcher():

watcher = ArgusWatcher(
    record_http=True,      # save API calls to disk for deterministic reruns
    semantic_judge=True,   # LLM judge on every node (needs OPENAI_API_KEY)
    judge_model="gpt-4o",  # model for the judge. default: gpt-4o
)
# heads up: semantic_judge calls GPT-4o per node — adds to your
# OpenAI bill. worth it for complex pipelines, overkill for simple ones.

You can mix and match — use any combination that fits your pipeline.`

function LLMPromptBox() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(LLM_PROMPT).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className="my-6 rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}
      >
        <div className="flex items-center gap-2.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="12" rx="2" stroke="var(--text-muted)" strokeWidth="1.2"/>
            <path d="M4 5h6M4 7.5h4M4 10h5" stroke="var(--text-muted)" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            LLM Prompt — paste into Claude Code, Cursor, etc.
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded transition-all"
          style={{
            color: copied ? '#3d9e7d' : 'var(--text-secondary)',
            background: copied ? 'rgba(61,158,125,0.08)' : 'var(--bg-overlay)',
            border: `1px solid ${copied ? 'rgba(61,158,125,0.25)' : 'var(--border-subtle)'}`,
          }}
        >
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 5.5l2.5 2.5 4.5-5" stroke="#3d9e7d" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <rect x="3.5" y="1" width="6.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.1"/>
                <path d="M1 3.5h2M1 3.5v6.5h6.5v-1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Prompt text */}
      <pre
        className="px-5 py-4 text-[12.5px] leading-relaxed font-mono overflow-x-auto whitespace-pre-wrap"
        style={{ color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
      >
        {LLM_PROMPT}
      </pre>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function GuideContent() {
  return (
    <article className="pb-20 max-w-[720px]">
      <PageTitle>How to Use Argus</PageTitle>
      <Body>
        A step-by-step walkthrough of every section in the Argus dashboard — from browsing
        your run history to reading failure details, comparing executions, and rerunning from
        a broken node.
      </Body>

      {/* ── LLM Quick-start prompt ──────────────────────────────────────── */}
      <div className="mt-6 mb-2">
        <p className="text-[13px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
          Quick-start — paste this into your LLM (Claude Code, Cursor, etc.) to add ARGUS to your pipeline:
        </p>
        <LLMPromptBox />
      </div>

      <Divider />

      {/* ── 1. Runs List ─────────────────────────────────────────────────── */}
      <SectionTitle>1. Runs List</SectionTitle>
      <Body>
        The home page is your pipeline execution history. Every time your pipeline runs with
        Argus attached, an entry appears here automatically.
      </Body>

      <Screenshot
        src="/guide/runs-list.png"
        alt="Argus runs list page"
        caption="The runs list — aggregate stats at the top, evaluation panel, and the full run table below."
      />

      <SubTitle>Summary cards</SubTitle>
      <FieldGroup items={[
        { field: 'Total Runs', description: 'Number of pipeline executions recorded in your workspace.' },
        { field: 'Clean', description: 'Runs where every node passed with no failures detected.' },
        { field: 'Failed', description: 'Runs with at least one silent failure, crash, or semantic failure.' },
        { field: 'Pass Rate', description: 'Percentage of clean runs over the total.' },
      ]} />

      <SubTitle>Run table columns</SubTitle>
      <FieldGroup items={[
        { field: 'RUN ID', description: 'Unique identifier for the run. Click to open the full detail view.' },
        { field: 'STATUS', description: 'Overall result — clean, silent failure, crashed, or semantic fail.' },
        { field: 'GRAPH', description: 'The node execution path, summarised as a chain.' },
        { field: 'STEPS', description: 'Total number of nodes that executed in this run.' },
        { field: 'FIRST FAILURE', description: 'The first node that produced bad output — the likely root cause.' },
        { field: 'SHAPE', description: 'Whether all expected nodes ran (full) or the run was cut short (partial).' },
      ]} />

      <SubTitle>Evaluation panel</SubTitle>
      <Body>
        The Evaluation section lets you filter runs by criteria — set a goal description and
        add constraints like <Code>overall_status == clean</Code> to find runs that meet
        specific conditions. Hit <strong>Evaluate</strong> to filter the table.
      </Body>

      <Note>Click any run ID to open its full detail page.</Note>

      <Divider />

      {/* ── 2. Run Detail ────────────────────────────────────────────────── */}
      <SectionTitle>2. Run Detail</SectionTitle>
      <Body>
        The run detail page gives you a complete picture of what happened during a single
        pipeline execution — metrics, the execution trace, AI analysis, and the initial state.
      </Body>

      <Screenshot
        src="/guide/run-detail-1.png"
        alt="Run detail — header, root cause, metrics, and execution timeline"
        caption="Top of the run detail page: run ID, status, root cause chain, metrics grid, and the execution timeline."
      />

      <SubTitle>Header</SubTitle>
      <Body>
        Shows the run ID, overall status badge, timestamp, total duration, step count, and
        Argus version. The <strong>Compare</strong> button lets you immediately diff this run
        against another.
      </Body>

      <SubTitle>Root cause chain</SubTitle>
      <Body>
        When a failure propagates downstream, Argus traces back to find the originating node.
        The red banner shows the chain — e.g. <Code>extract_skills → generate_summary</Code> — so
        you know exactly which node to fix, not which node complained.
      </Body>

      <SubTitle>Metrics</SubTitle>
      <FieldGroup items={[
        { field: 'Duration', description: 'Total wall-clock time for the full pipeline execution.' },
        { field: 'Success Rate', description: 'Percentage of nodes in this run that passed.' },
        { field: 'Failures', description: 'Number of nodes with any failure status.' },
        { field: 'Severity', description: 'Worst severity level seen: ok, warning, or critical.' },
        { field: 'Completed', description: 'Whether the pipeline ran to the final node or was cut short.' },
      ]} />

      <SubTitle>Execution timeline</SubTitle>
      <Body>
        Each node is listed in order with its name, output type tag, duration, and status.
        Nodes with failures show an indented root cause annotation — the specific field that
        was missing and which upstream node failed to produce it. Expand any row with the
        arrow to see the full input/output JSON.
      </Body>

      <Screenshot
        src="/guide/run-detail-2.png"
        alt="Execution timeline showing degraded input nodes and AI analysis"
        caption="Lower execution timeline showing degraded_input propagation, followed by the AI Analysis panel."
      />

      <SubTitle>AI Analysis</SubTitle>
      <Body>
        When <Code>OPENAI_API_KEY</Code> is set, Argus automatically investigates non-clean
        runs. The panel breaks down the failure into three parts:
      </Body>
      <div className="my-4 space-y-3 pl-1">
        <div>
          <p className="text-[14px] font-semibold mb-0.5" style={{ color: 'var(--text-primary)', fontFamily: "'Georgia', serif" }}>
            Root Cause Node
          </p>
          <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: "'Georgia', serif" }}>
            The specific node Argus identified as the origin of the failure — not the node
            that complained, but the one that first produced the broken state.
          </p>
        </div>
        <div>
          <p className="text-[14px] font-semibold mb-0.5" style={{ color: 'var(--text-primary)', fontFamily: "'Georgia', serif" }}>
            Reason
          </p>
          <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: "'Georgia', serif" }}>
            A concise explanation of why that node failed and how the bad state propagated
            through downstream nodes.
          </p>
        </div>
        <div>
          <p className="text-[14px] font-semibold mb-0.5" style={{ color: 'var(--text-primary)', fontFamily: "'Georgia', serif" }}>
            How to Fix It
          </p>
          <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: "'Georgia', serif" }}>
            Numbered action items — each targeting a specific node — telling you exactly
            what to change to prevent the failure from recurring.
          </p>
        </div>
      </div>
      <Body>
        A confidence score is shown in the top-right of the panel. The footer shows how many
        causal hypotheses were evaluated and how many observations were used.
      </Body>

      <Screenshot
        src="/guide/run-detail-3.png"
        alt="AI analysis fix steps, correlation panel, and behavior section"
        caption="AI fix steps, the Correlation panel (origin node + confidence), and the Behavior/Initial State sections."
      />

      <SubTitle>Correlation</SubTitle>
      <Body>
        Argus runs a correlation analysis to confirm which node is the true origin of the
        degradation. Shows the origin node name, step index, failure signals (e.g.{' '}
        <Code>missing_field</Code>), and a confidence score.
      </Body>

      <SubTitle>Behavior &amp; Initial State</SubTitle>
      <Body>
        The Behavior section shows the raw initial state your pipeline received — the exact
        input dict at invocation time. Useful for reproducing the failure locally.
      </Body>

      <Divider />

      {/* ── 3. Compare ───────────────────────────────────────────────────── */}
      <SectionTitle>3. Compare</SectionTitle>
      <Body>
        Compare two runs side-by-side to see exactly what changed — useful for verifying a
        fix worked, catching regressions, or understanding why one run is faster than another.
      </Body>

      <Screenshot
        src="/guide/compare.png"
        alt="Compare page showing winner verdict and node-by-node diff"
        caption="Compare page: winner verdict at the top, aggregate stats table, then a node-by-node status comparison."
      />

      <SubTitle>How to compare</SubTitle>
      <div className="mb-5 space-y-1">
        <StepItem n={1} title="Open Compare">
          Click <strong>Compare</strong> in the sidebar, or use the Compare button on any run detail page (pre-fills Run A).
        </StepItem>
        <StepItem n={2} title="Enter two run IDs">
          Paste a Run A (typically the older / broken run) and Run B (the newer / fixed run).
        </StepItem>
        <StepItem n={3} title="Read the verdict">
          The winner banner shows which run performed better and why — fewer failures, faster duration, higher success rate.
        </StepItem>
        <StepItem n={4} title="Read the node diff">
          Each node is listed with its status in A and B. Nodes only present in one run are labelled <em>only in A</em> or <em>only in B</em>. Status changes are highlighted.
        </StepItem>
      </div>

      <Body>
        The aggregate table shows Failures, Duration, and Success Rate side-by-side with a
        winner indicator (<Code>B ✓</Code>) for each metric.
      </Body>

      <Divider />

      {/* ── 4. Rerun ─────────────────────────────────────────────────────── */}
      <SectionTitle>4. Rerun</SectionTitle>
      <Body>
        Rerun re-executes your pipeline from a specific node using the frozen input state
        captured from a previous run. This means you can test a fix without re-running
        the full pipeline or making new LLM calls for the nodes before the broken one.
        External API calls (OpenAI, search tools, etc.) execute live by default.
        Use <Code>record_http=True</Code> to capture and replay them from disk for
        fully deterministic reruns.
      </Body>

      <SubTitle>How rerun works</SubTitle>
      <Body>
        When Argus records a run, it saves the input state at every node. When you rerun
        from node X, Argus loads the exact input that node X received originally, then
        re-executes node X and everything downstream with your current code. A new run ID
        is created for the result.
      </Body>

      <SubTitle>Step by step — from the dashboard</SubTitle>
      <div className="mb-5 space-y-1">
        <StepItem n={1} title="Open the failing run">
          Click the run ID on the runs list to open its detail page.
        </StepItem>
        <StepItem n={2} title="Find the root cause node">
          Check the red root cause banner at the top — it names the node that first produced
          bad output. That&apos;s the node you want to rerun from.
        </StepItem>
        <StepItem n={3} title="Click the rerun icon">
          In the execution timeline, each node row has a rerun icon (↺) on the right.
          Click it on the root cause node.
        </StepItem>
        <StepItem n={4} title="Wait for the new run">
          Argus re-executes from that node forward. When done, you&apos;re taken to the new
          run&apos;s detail page with a fresh set of results.
        </StepItem>
        <StepItem n={5} title="Compare to confirm">
          Use the <strong>Compare</strong> button to diff the original run against the rerun.
          The broken nodes should now show <Code>pass</Code>.
        </StepItem>
      </div>

      <SubTitle>Step by step — from the CLI</SubTitle>
      <CodeBlock title="Rerun from a specific node">
{`argus replay <run-id> <node-name>`}
      </CodeBlock>
      <CodeBlock title="If node functions weren't stored in the run">
{`argus replay <run-id> <node-name> --app my_pipeline:build_graph`}
      </CodeBlock>
      <Body>
        The <Code>--app</Code> flag takes a <Code>module:function</Code> path to your graph
        factory function. Only needed if node function references weren&apos;t captured at
        recording time. After rerun, use <Code>argus diff</Code> to compare:
      </Body>
      <CodeBlock>
{`argus diff <original-run-id> <rerun-run-id>`}
      </CodeBlock>

      <Note>
        Screenshots for the rerun UI will be added in a future update.
      </Note>

      <Divider />

      {/* ── 5. Optional Parameters ────────────────────────────────────── */}
      <SectionTitle>5. Optional Parameters</SectionTitle>
      <Body>
        All optional features live in the <Code>ArgusWatcher()</Code> constructor.
        Mix and match whatever fits your pipeline:
      </Body>

      <CodeBlock title="All optional parameters explained">
{`watcher = ArgusWatcher(
    # --- Deterministic rerun ---
    record_http=True,       # saves every outbound API call (OpenAI, search, etc.)
                            # to disk. reruns replay from disk instead of calling
                            # live APIs — zero extra cost, fully reproducible.

    # --- LLM semantic judge ---
    semantic_judge=True,    # enables an LLM that reviews every node's output for
                            # subtle quality issues (wrong tone, unhelpful, outdated).
                            # runs AFTER deterministic checks — so it only adds cost
                            # where structural checks can't tell if something's off.
                            # heads up: this calls GPT-4o once per node, so your
                            # OpenAI bill will go up. worth it for complex pipelines,
                            # probably overkill for simple ones.

    judge_model="gpt-4o",  # which model the semantic judge uses. default is gpt-4o.
                            # swap to gpt-4o-mini if you want cheaper runs.
)`}
      </CodeBlock>

      <SubTitle>record_http — deterministic reruns</SubTitle>
      <Body>
        By default, when you rerun from a node, any external API calls (OpenAI, DuckDuckGo, etc.)
        execute live again. Different results, extra cost.
        With <Code>record_http=True</Code>, ARGUS captures every HTTP request and response
        during the original run. On rerun, it serves the recorded responses back — same data,
        zero cost, fully reproducible.
      </Body>
      <Body>
        <strong>Use it</strong> when your pipeline calls paid APIs and you want cheap, identical reruns.
        <strong> Skip it</strong> when you <em>want</em> the rerun to hit the real API — e.g. testing a new prompt.
      </Body>

      <SubTitle>semantic_judge — LLM-powered quality checks</SubTitle>
      <Body>
        ARGUS catches ~80% of production failures deterministically (missing fields, empty results,
        type mismatches, placeholder outputs) — zero cost, zero false positives.
        The remaining ~20% are subtle: wrong tone, unhelpful responses, outdated info,
        answering the wrong question. That&apos;s what the semantic judge is for.
      </Body>
      <FieldGroup items={[
        { field: 'Deterministic first', description: 'Structural checks always run first — free, instant, reproducible.' },
        { field: 'LLM second', description: 'The judge only reviews what the structural layer couldn\'t decide.' },
        { field: 'Per-node', description: 'Each node\'s output is evaluated in context of its input and the pipeline\'s purpose.' },
        { field: 'Hypotheses', description: 'The judge generates causal hypotheses ranked by confidence, with supporting evidence.' },
      ]} />
      <Body>
        Requires <Code>OPENAI_API_KEY</Code> in your environment. Uses GPT-4o by default.
      </Body>
      <Body>
        <strong>Use it</strong> for complex multi-agent pipelines, customer-facing outputs,
        or when deterministic checks show &ldquo;pass&rdquo; but outputs still feel wrong.
        <strong> Skip it</strong> for simple pipelines, CI/CD speed runs, or if you want
        zero monitoring costs.
      </Body>
    </article>
  )
}
