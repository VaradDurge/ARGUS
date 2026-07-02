# ARGUS Trial UI — Complete Specification

> **Purpose**: Build a self-contained, interactive trial/demo UI for the ARGUS website that visitors can click through without needing a backend. All data is hardcoded mock data. This document contains everything another Claude session needs to build it.

---

## Table of Contents
1. [Overview & Scope](#1-overview--scope)
2. [Design System](#2-design-system)
3. [Navigation / Sidebar](#3-navigation--sidebar)
4. [Page 1: Runs List + Run Detail](#4-page-1-runs-list--run-detail)
5. [Page 2: Compare](#5-page-2-compare)
6. [Page 3: Approvals](#6-page-3-approvals)
7. [Page 4: Changelog](#7-page-4-changelog)
8. [Mock Data](#8-mock-data)
9. [Interactions & Constraints](#9-interactions--constraints)
10. [Tech Stack](#10-tech-stack)

---

## 1. Overview & Scope

Build a **static, interactive trial UI** (like Linear's homepage demo) that showcases ARGUS's dashboard. No backend required — all data is hardcoded JSON.

### Pages to include (fully interactive):
- **Runs** — list + detail panel (master-detail layout)
- **Compare** — two preloaded runs side-by-side with all tabs
- **Approvals** — 2-3 approval cards with Private/Shared actions
- **Changelog** — version timeline (read-only)

### Pages to show as disabled ("soon"):
- Traces, Evaluation, Graphs, Alerts, Datasets, Settings

### Key behaviors:
- Only the **first run** (silent failure run) in the runs list is clickable — opens full detail
- Other runs are visible but clicking them does nothing (or shows a tooltip "Try the first run")
- **Replay** is mocked — user clicks replay, sees a simulated animation, then a "fixed" result appears
- **Compare** page has two runs preloaded, all tabs switchable
- **Approvals** has 2-3 mock candidates where user can click Private/Shared

---

## 2. Design System

### Colors (CSS Variables)
```css
:root {
  color-scheme: dark;

  --background:           #0a0a0a;
  --foreground:           #ffffff;
  --card:                 #0d0d0d;
  --card-foreground:      #ffffff;
  --primary:              #5b6af0;       /* Indigo — main accent */
  --primary-foreground:   #ffffff;
  --secondary:            #0d0d0d;
  --muted:                #0d0d0d;
  --muted-foreground:     #6b6b6b;
  --border:               #1a1a1a;
  --input:                #1a1a1a;
  --ring:                 #5b6af0;
  --radius:               10px;

  --success:              #22c55e;       /* Green — pass/clean */
  --warning:              #f59e0b;       /* Amber — silent failure */
  --destructive:          #ef4444;       /* Red — crashed */
  --accent-magenta:       #a855f7;       /* Purple — semantic fail */
  --accent-cyan:          #3b82f6;       /* Blue — info/running */

  --text-secondary:       #6b6b6b;
  --text-tertiary:        #454545;
  --text-muted:           #454545;

  --border-subtle:        #1a1a1a;
  --border-strong:        #2a2a2a;

  --sidebar:              #0d0d0d;
  --sidebar-foreground:   #888888;
  --sidebar-border:       #1a1a1a;
  --sidebar-active:       rgba(91,106,240,0.10);
}
```

### Typography
- **Primary font**: Geist Sans (fallback: -apple-system, BlinkMacSystemFont, sans-serif)
- **Monospace**: JetBrains Mono (fallback: 'Fira Code', Menlo, Monaco, Consolas)
- **Letter spacing**: -0.011em (body text)
- **Font features**: 'cv02', 'cv03', 'cv04', 'cv11'
- **Antialiasing**: -webkit-font-smoothing: antialiased

### Size scale
- Body text: 13-14px
- Small labels / muted: 10-12px
- Headings: 18-22px
- Run ID in header: 20px bold, tracking -0.03em

### Radius
- Cards/buttons: 10px (var(--radius))
- Badges: 4px
- Inputs: 8px

### JSON Syntax Highlighting
```css
.json-key     { color: #8b9bf4; }
.json-string  { color: #7faf8e; }
.json-number  { color: #c0926a; }
.json-boolean { color: #c0926a; }
.json-null    { color: #8a8a8a; }
```

### Animations
```css
/* Page transition */
@keyframes pageFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Pulse for active dots */
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}

/* Soft pulse */
@keyframes soft-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
```

### Scrollbar
```css
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
```

---

## 3. Navigation / Sidebar

Width: **220px**, full height, left side, border-right.

### Structure:
```
[Logo + "ARGUS" + "Production" + chevron]
[Search input: "Search runs..." with / kbd shortcut]

OBSERVE (section label — 11px uppercase tracking-wider #454545)
  ├── Runs          → active page indicator (indigo left border + white text)
  └── Traces        → grayed out + "soon" badge

ANALYZE
  ├── Compare       → navigable
  ├── Approvals     → navigable
  └── Evaluation    → "soon"

WORKFLOWS
  ├── Graphs        → "soon"
  ├── Alerts        → "soon"
  └── Datasets      → "soon"

─── bottom section ───
  ├── Guide         → "soon" for trial
  ├── Changelog     → navigable
  ├── Report Board  → "soon" for trial
  └── Settings      → "soon"

[User footer: avatar circle + "Demo User" + "demo@argus.dev"]
```

### Logo SVG (inline):
```html
<svg width="14" height="14" viewBox="0 0 18 18" fill="none">
  <path d="M9 1.5L16.5 5.5V12.5L9 16.5L1.5 12.5V5.5L9 1.5Z"
        stroke="#5b6af0" stroke-width="1.2" fill="none"/>
  <circle cx="9" cy="9" r="2.2" fill="rgba(91,106,240,0.15)"
          stroke="#5b6af0" stroke-width="1.1"/>
  <circle cx="9" cy="9" r="0.9" fill="#5b6af0"/>
</svg>
```

### Nav row styling:
- Active: `border-l-2 border-primary font-medium text-foreground`
- Inactive: `border-l-2 border-transparent text-[#888] hover:text-white`
- "soon" items: `cursor-not-allowed opacity-60` + badge `bg-muted text-muted-foreground text-[10px] font-mono px-1.5 py-0.5 rounded-full`

### Icons (use lucide-react):
Activity, Workflow, GitCompareArrows, ClipboardCheck, FlaskConical, Network, Bell, Database, BookOpen, Clock, MessageSquareWarning, Settings, Search, LogOut, ChevronsUpDown

---

## 4. Page 1: Runs List + Run Detail

### Layout
Master-detail: Left panel (runs list) + Right panel (run detail). Full viewport height.

### Runs List Panel (Left)

**Header:**
```
Runs                                    [Filters] [Last 1h ▾] [⟳ Refresh]
5 runs · 1 clean · 4 failed
```

**Filter tabs:** All | Clean | Failed | Semantic | Interrupted

**Search:** Input with magnifying glass icon, placeholder "Search runs..."

**Table columns:**
| Run | Status | Steps | Duration | Tokens | → |
Grid: `grid-cols-[1.6fr_0.9fr_1.1fr_0.8fr_0.7fr_0.4fr]`

**Table header:** 11px uppercase tracking-wider, muted-foreground, bg-muted/30

### Mock Runs Data (5 runs in list):

#### Run 1 — CLICKABLE (the demo run)
- **Display name**: `ingest → knowledge_retriever → response_drafter`
- **ID**: `run-silent-001` (show as `run-sile`)
- **Status badge**: Silent Failure (amber dot + "Silent Failure" text)
- **First failure**: `knowledge_retriever` (red text after dot separator)
- **Steps**: 3 colored dots — green, red (with glow), amber + "3/3"
- **Duration**: `2.09s` / `2h ago`
- **Tokens**: `—`

#### Run 2 — NOT CLICKABLE
- **Display name**: `ingest → classify → draft → finalize`
- **ID**: `run-clean-001` (show as `run-clea`)
- **Status**: Clean (green)
- **Steps**: 4 green dots + "4/4"
- **Duration**: `1.00s` / `3h ago`

#### Run 3 — NOT CLICKABLE
- **Display name**: `ingest → classify → draft → finalize`
- **ID**: `run-crash-001` (show as `run-cras`)
- **Status**: Crashed (red)
- **First failure**: `draft`
- **Steps**: green, green, red, gray + "3/4"
- **Duration**: `0.82s` / `4h ago`

#### Run 4 — NOT CLICKABLE
- **Display name**: `ingest → [parallel: fetch_a, fetch_b] → merge`
- **ID**: `run-parallel-001` (show as `run-para`)
- **Status**: Silent Failure (amber)
- **First failure**: `fetch_b`
- **Steps**: green, green, red, amber + "4/4"
- **Duration**: `3.12s` / `5h ago`

#### Run 5 — NOT CLICKABLE
- **Display name**: `ingest → check → decide → check → decide → finalize`
- **ID**: `run-cycle-001` (show as `run-cycl`)
- **Status**: Silent Failure (amber)
- **Steps**: 6 dots (green, green, amber, green, red, amber) + "6/6"
- **Duration**: `4.55s` / `6h ago`

### Node Dots Colors:
- Green `#22c55e` — passed
- Red `#ef4444` — crashed/failed (add `box-shadow: 0 0 6px rgba(239,68,68,0.5)`)
- Amber `#eab308` — silent failure / downstream of failure
- Purple `#a855f7` — semantic fail
- Gray `rgba(139,143,160,0.20)` — not reached

### Run Status Badge Component:
```
[●] Label          color          bg (10% mix)      border (25% mix)
Clean               #22c55e       green/10%          green/25%
Silent Failure      #eab308       amber/10%          amber/25%
Crashed             #ef4444       red/10%            red/25%
Semantic Fail       #a855f7       purple/10%         purple/25%
Interrupted         #8b8fa0       gray/10%           gray/25%
```
Badge: `px-2 py-0.5 text-[11px] font-medium rounded-[4px] border inline-flex items-center gap-1.5`

### Run Detail Panel (Right) — Shows when Run 1 is clicked

**Header:**
```
← All runs

run-silent-001                    [Silent Failure badge]    [Report Issue] [Logs] [▶ Replay]
run-silent-0 · Argus v0.3.5 · 3 steps · 2091 ms
```

**Tabs:** Overview | Pipeline | AI Analysis | Correlations | State | Logs
- Active tab: white text + 2px indigo bottom bar
- Inactive: muted text, hover lighter

### Overview Tab Content:

1. **Execution Graph** (visual DAG):
   ```
   [ingest] ──→ [knowledge_retriever] ──→ [response_drafter]
     (green)        (amber/red)              (amber)
   ```
   - Nodes are rounded rectangles with status-colored borders
   - Edges are arrows (dashed animation)
   - Background: dot-grid pattern (#0a0a0a with #1c1c1c dots, 20px spacing)

2. **AI Analysis Summary Card:**
   ```
   🔍 AI Analysis
   Confidence: 82%                          [View full analysis →]

   Root Cause Node: knowledge_retriever

   The knowledge_retriever node experienced a timeout when querying the
   knowledge base, causing it to return an error key instead of the required
   kb_articles field. This missing field propagated downstream...
   ```
   - Card: bg-card, border, rounded-xl
   - Confidence: colored badge (green ≥80%, amber ≥60%, red <60%)

3. **Metrics Bar:**
   ```
   Duration    Steps       Tokens    Cost      Version    Started
   2,091 ms    3/3 steps   —         —         v0.3.5     2026-04-22 11:52
   ```
   - Inline flex, gap-6, font-mono for values

4. **Step Inspector** (when clicking a node):
   Shows expandable input/output JSON for that node.

### Pipeline Tab Content:

**Root Cause Banner:**
```
Root cause chain: knowledge_retriever → response_drafter
```
(Red text, horizontal chain with arrows)

**Metrics Bar** (same as overview)

**Step-by-step execution:**

```
Step 0  ingest                    ✓ pass           184 ms
        Input: { "query": "refund for order #7781", "account_id": "acct_7781" }
        Output: { "intent": "refund_request", "account_id": "acct_7781", "priority": "p2" }

Step 1  knowledge_retriever       ⚠ silent failure  1087 ms
        Input: { "intent": "refund_request", "account_id": "acct_7781" }
        Output: { "error": "kb_timeout", "kb_articles": null }

        ── Inspection ──
        ⚠ SILENT FAILURE: missing required field "kb_articles"
        Field "kb_articles" is missing
        response_drafter received bad state

        ── Tool Failures ──
        ⚠ Tool error_response: field "kb_articles" — Knowledge base timeout after 5000ms

Step 2  response_drafter          ⬇ degraded input  820 ms
        Input: { "error": "kb_timeout", "kb_articles": null, "intent": "refund_request" }
        Output: { "response": "I apologize, but I'm unable to process your request at this time..." }

        Field "kb_articles" missing from input
        upstream node knowledge_retriever failed to produce it
```

Each step row:
- Step index (monospace, muted)
- Node name (font-medium)
- Status icon + label (colored)
- Duration (font-mono, right-aligned)
- Expandable input/output (JSON viewer with syntax highlighting)
- Inspection details in muted text

**Replay button** appears on hover over step rows:
- "Rerun from here" for full replay
- "Rerun this node" for single-node replay

### AI Analysis Tab:

```
AI Investigation

Confidence: 82%     Root cause: knowledge_retriever

─── Root Cause ───
The knowledge_retriever node experienced a timeout when querying the knowledge
base API, causing it to return an error response with kb_articles set to null.
This missing field was required by the downstream response_drafter node, which
then produced a degraded fallback response without KB context.

─── What Happened ───
1. The ingest node correctly parsed the incoming query with intent "refund_request"
2. knowledge_retriever attempted to query the knowledge base but timed out after 5000ms
3. Instead of raising an exception, it returned a partial response with error key
4. ARGUS detected the missing kb_articles field as a silent failure
5. response_drafter received degraded input and produced a generic fallback response

─── Debugging Suggestions ───
1. [knowledge_retriever] Add retry logic with exponential backoff for KB API calls
2. [knowledge_retriever] Implement a circuit breaker pattern to prevent cascade timeouts
3. [response_drafter] Add explicit handling for missing kb_articles to provide
   meaningful error responses instead of generic fallbacks

─── Causal Hypotheses ───
• KB API latency spike (confidence: 85%)
  Evidence: 5000ms timeout, error_response in tool_failures
  Category: external_dependency

• Missing fallback in retriever (confidence: 72%)
  Evidence: Node returned error key instead of raising exception
  Category: error_handling
```

### Correlations Tab:

```
Degradation Origin
  Node: knowledge_retriever (step 1)
  Signal: field_drop, tool_failure
  Confidence: 91%
  Reason: KB timeout caused missing kb_articles field

Propagation Chain
  Type: tool_failure_cascade
  knowledge_retriever → response_drafter
  Summary: Tool failure in knowledge_retriever dropped required field,
           causing response_drafter to receive degraded input

Causal Summary
  "A knowledge base timeout at the knowledge_retriever node silently dropped
   the kb_articles field, propagating degraded state to response_drafter."
```

### State Tab:
Shows initial state JSON:
```json
{
  "query": "I need a refund for order #7781",
  "account_id": "acct_7781",
  "channel": "chat"
}
```

### Logs Tab:
```
2026-04-22T11:52:00.021Z  INFO   run=run-silent-001  node=ingest              msg="intent=refund_request account_id=acct_7781"
2026-04-22T11:52:01.108Z  WARN   run=run-silent-001  node=knowledge_retriever  msg="kb timeout; returning error key"
2026-04-22T11:52:01.109Z  ERROR  run=run-silent-001  node=knowledge_retriever  msg="ARGUS silent failure: missing required field kb_articles"
2026-04-22T11:52:02.004Z  INFO   run=run-silent-001  node=response_drafter     msg="drafted fallback response (no KB context)"
```
Monospace, color-coded: INFO=#6b6b6b, WARN=#f59e0b, ERROR=#ef4444

### Replay Mock Behavior:

When user clicks "Replay" button or "Rerun from here" on knowledge_retriever:

1. **Show banner**: "Submitting rerun..." (1s)
2. **Show banner**: "Rerunning pipeline... job-demo-001" with pulsing dot (2s)
3. **Show banner**: "Rerun complete!" (green) with "View comparison" button
4. Clicking "View comparison" navigates to Compare page with the original + "fixed" run preloaded

For **single-node rerun** (click "Rerun this node" on knowledge_retriever):
1. Same submitting/running animation (1.5s total)
2. Show inline before/after diff:
   ```
   Before:  { "error": "kb_timeout", "kb_articles": null }
   After:   { "kb_articles": [{"id": "kb-102", "title": "Refund Policy", ...}] }
   ```
   Green highlight on new fields, red on removed error fields.

---

## 5. Page 2: Compare

### URL: `/compare`
Two runs preloaded: `run-silent-001` (Base) vs `run-silent-001-replay` (Replay)

### Header:
```
Compare Runs                                           [← Back to run]
Side-by-side comparison of pipeline executions

[Base Run ▾: run-silent-001]  ⇄  [Replay ▾: run-silent-001-replay]

┌─────────────────────┐    ┌─────────────────────────┐
│ run-silent-001       │    │ run-silent-001-replay    │
│ ● Silent Failure     │    │ ● Clean                  │
│ 3 steps · 2,091 ms  │    │ 3 steps · 1,847 ms      │
└─────────────────────┘    └─────────────────────────┘
```

### Tabs:
Overview | Node Comparison | Diff View | Metrics | AI Analysis | Execution Timeline | Logs Comparison

Each tab has an icon (from lucide-react).

### Overview Tab:
1. **Summary Metrics:**
   ```
   Failures:     2 → 0        ✓ Fixed
   Success Rate: 33% → 100%   ↑ +67%
   Duration:     2,091ms → 1,847ms  ↓ -244ms (faster)
   ```
   Green highlight for improvements.

2. **Pipeline Comparison:**
   Visual diff of both pipelines side by side.

3. **Node Comparison Table:**
   | Node | Before | After | Changes |
   |------|--------|-------|---------|
   | ingest | ✓ pass | ✓ pass | No changes |
   | knowledge_retriever | ⚠ fail | ✓ pass | ✓ FIXED: kb_articles now present |
   | response_drafter | ⬇ degraded | ✓ pass | ✓ FIXED: receives full context |

4. **Key Changes:**
   - knowledge_retriever: FIXED — no longer timing out
   - response_drafter: FIXED — receives full KB context
   - Overall: silent_failure → clean

### Node Comparison Tab:
Full table with detailed per-node diffs.

### Diff View Tab:
- Node selector dropdown (default: knowledge_retriever — first differing node)
- Structured JSON diff:
  ```diff
  - "error": "kb_timeout"
  - "kb_articles": null
  + "kb_articles": [{"id": "kb-102", "title": "Refund Policy", "content": "..."}]
  ```
  Green for added, red for removed.

### Metrics Tab:
```
                    Base           Replay        Winner
Failures            2              0             Replay ✓
Success Rate        33.3%          100%          Replay ✓
Duration            2,091 ms       1,847 ms      Replay ✓
Steps               3              3             Tie
Cost                —              —             —
Tokens              —              —             —
```

### AI Analysis Tab:
Two panels side by side:
- **Base run**: Shows full investigation (same as run detail AI Analysis)
- **Replay**: Shows "No investigation triggered — all steps passed"

**Comparative Summary:**
```
Status: silent_failure → clean ✓
Confidence: 82% → N/A (no failures)
Root cause resolved: knowledge_retriever no longer returns error key
```

### Timeline Tab:
Two columns:
```
Base Run                          Replay
─────────                         ──────
0  ingest        184ms  ✓        0  ingest        172ms  ✓
1  knowledge_r.  1087ms ⚠        1  knowledge_r.  893ms  ✓
2  response_d.   820ms  ⬇        2  response_d.   782ms  ✓
```

### Logs Tab:
Show "Coming soon" placeholder.

---

## 6. Page 3: Approvals

### Header:
```
Approvals                    [3 pending badge]
Review AI-discovered patterns and manage your active detection library.
```

### Tabs (segmented control with counts):
```
[Pending 3] [Feedback 1] [Private 2] [Shared 4]
```
Active tab: `bg: rgba(124,127,199,0.1)`, `color: #7c7fc7`

### Pending Tab — 3 Candidate Cards:

#### Candidate 1:
```
[critical] [regex] [placeholder_outputs]              [3x seen] [2h ago]

Pattern: (?i)^(I('m| am) sorry|unfortunately|I cannot|I'm unable).*

Description: Detects common LLM apology/refusal patterns that indicate
the model failed to produce a substantive response.

Confidence: ████████████░░░ 87%

[Show details]                              [Reject] [Private] [🔼 Shared]
```

When expanded:
```
LLM Reasoning: "This pattern consistently appears when the knowledge base
is unavailable and the LLM falls back to generic responses..."

Evidence:
  "I'm sorry, but I'm unable to process your request at this time..."
  "Unfortunately, I cannot find the information you're looking for..."

Runs: run-sile... run-para...
```

#### Candidate 2:
```
[warning] [contains_ci] [null_like_semantic]           [5x seen] [4h ago]

Pattern: no results found

Description: Detects empty result patterns from retrieval nodes.

Confidence: ██████████░░░░░ 72%
```

#### Candidate 3:
```
[warning] [repetition] [repeated_filler_text]          [2x seen] [6h ago]

Pattern: N/A repeated 4+ times

Description: Catches repeated filler values in structured outputs.

Confidence: ████████░░░░░░░ 65%
```

### Feedback Tab — 1 Feedback Card:
```
[anomaly override] [anom_001] [retrieval_result]      [2x seen] [3h ago]

Node: knowledge_retriever

┌──────────────────────────────────────────────────┐
│ Detector said:  Suspicious empty result pattern   │
│ LLM said:       Timeout is expected behavior      │
│                 under high load conditions         │
└──────────────────────────────────────────────────┘

LLM confidence: ████████████░░░ 78%

[Show details]                    [Dismiss] [Disagree] [Agree]
```

### Private Tab — 2 Signatures:
```
sig-001  [critical] [regex] [private]
Pattern: (?i)^(I('m| am) sorry|unfortunately).*
Description: LLM apology/refusal pattern detection

sig-002  [warning] [contains_ci] [private]
Pattern: no results found
Description: Empty retrieval result detection
                                                    [Remove]
```

### Shared Tab — Show 3-4 signatures (no remove button) + Sync button
```
[🔄 Sync]

sig-shared-001  [critical] [regex] [shared]  by community  2d ago
Pattern: (?i)\bplaceholder\b
Description: Generic placeholder text in LLM outputs

sig-shared-002  [warning] [exact_ci] [shared]  by community  5d ago
Pattern: TODO
Description: Unfinished TODO markers in generated content
```

### Interaction for Approvals:
- Clicking "Private" on a pending card: card disappears with fade, moves to Private tab (increment count)
- Clicking "Shared" on a pending card: same, moves to Shared tab
- Clicking "Reject": shows confirmation ("Reject? [Yes] [No]"), then removes card
- These are client-side state changes only (no API calls in trial)

---

## 7. Page 4: Changelog

### Header:
```
Changelog
What's new in each version of ARGUS.
```
Font: Georgia/serif for version numbers and title.

### Timeline:
Vertical line (1.5px, #1a1a1a) on the left, dots at each version.

Latest version dot: filled #7c7fc7 with white inner dot.
Other dots: border only, #1a1a1a.

### Releases (include all):

```
● v0.5.0  [MAJOR]  2026-05-31
  Integration & Rerun Reliability
  • watch_compiled() — attach ARGUS to already-compiled graphs
  • Reducer-aware state merging — list fields append correctly during reruns
  • HTTP recording — opt-in record_http=True for deterministic reruns
  • argus doctor — 5-second diagnostic command
  • Renamed "replay" to "rerun" across all UI, CLI, and docs
  • Live-call warning in CLI

○ v0.4.4  [MINOR]  2026-05-26
  Detection Engine Upgrade
  • 7 new failure patterns
  • Single-node rerun
  • Inline before/after diff in CLI
  • 14 new semantic signatures

○ v0.4.3  [MINOR]  2026-05-22
  Master-Detail UI & Factory-Free Rerun
  ...

○ v0.4.0  [BETA]   2026-05-17
  Beta Testing Rollout
  ...

○ v0.3.10 [MINOR]  2026-05-06
  Rerun wired to UI
  ...

(... continue through v0.1.0)
```

### Tag badge colors:
```
MAJOR:  bg: rgba(61,158,125,0.1)   text: #3d9e7d
MINOR:  bg: rgba(212,154,46,0.1)   text: #d49a2e
PATCH:  bg: rgba(156,163,175,0.1)  text: #5d6370
BETA:   bg: rgba(124,127,199,0.1)  text: #7c7fc7
```

---

## 8. Mock Data

### Run: run-silent-001 (Full RunRecord)
```json
{
  "run_id": "run-silent-001",
  "argus_version": "0.3.5",
  "started_at": "2026-04-22T11:52:00.000Z",
  "completed_at": "2026-04-22T11:52:02.091Z",
  "duration_ms": 2091,
  "overall_status": "silent_failure",
  "first_failure_step": "knowledge_retriever",
  "root_cause_chain": ["knowledge_retriever", "response_drafter"],
  "graph_node_names": ["ingest", "knowledge_retriever", "response_drafter"],
  "graph_edge_map": {
    "ingest": ["knowledge_retriever"],
    "knowledge_retriever": ["response_drafter"],
    "response_drafter": []
  },
  "initial_state": {
    "query": "I need a refund for order #7781",
    "account_id": "acct_7781",
    "channel": "chat"
  },
  "steps": [
    {
      "step_index": 0,
      "node_name": "ingest",
      "status": "pass",
      "input_state": { "query": "I need a refund for order #7781", "account_id": "acct_7781", "channel": "chat" },
      "output_dict": { "intent": "refund_request", "account_id": "acct_7781", "priority": "p2" },
      "duration_ms": 184,
      "timestamp_utc": "2026-04-22T11:52:00.021Z",
      "exception": null,
      "inspection": { "is_silent_failure": false, "missing_fields": [], "empty_fields": [], "type_mismatches": [], "severity": "ok", "message": "All checks passed", "unannotated_successors": [], "suspicious_empty_keys": [], "tool_failures": [], "has_tool_failure": false, "semantic_signals": [], "degraded_fields": [], "degraded_upstream_node": null },
      "attempt_index": 0,
      "validator_results": [],
      "is_subgraph_entry": false,
      "subgraph_run_id": null,
      "llm_usage": null,
      "behavior_type": null,
      "anomaly_signals": []
    },
    {
      "step_index": 1,
      "node_name": "knowledge_retriever",
      "status": "fail",
      "input_state": { "intent": "refund_request", "account_id": "acct_7781", "priority": "p2" },
      "output_dict": { "error": "kb_timeout", "kb_articles": null },
      "duration_ms": 1087,
      "timestamp_utc": "2026-04-22T11:52:01.108Z",
      "exception": null,
      "inspection": {
        "is_silent_failure": true,
        "missing_fields": ["kb_articles"],
        "empty_fields": [],
        "type_mismatches": [],
        "severity": "critical",
        "message": "Silent failure: missing required field 'kb_articles' needed by response_drafter",
        "unannotated_successors": [],
        "suspicious_empty_keys": [],
        "tool_failures": [
          {
            "failure_type": "error_response",
            "field_name": "kb_articles",
            "severity": "critical",
            "evidence": "Knowledge base timeout after 5000ms"
          }
        ],
        "has_tool_failure": true,
        "semantic_signals": [],
        "degraded_fields": [],
        "degraded_upstream_node": null
      },
      "attempt_index": 0,
      "validator_results": [],
      "is_subgraph_entry": false,
      "subgraph_run_id": null,
      "llm_usage": null,
      "behavior_type": "retrieval_result",
      "anomaly_signals": []
    },
    {
      "step_index": 2,
      "node_name": "response_drafter",
      "status": "degraded_input",
      "input_state": { "error": "kb_timeout", "kb_articles": null, "intent": "refund_request", "account_id": "acct_7781" },
      "output_dict": { "response": "I apologize, but I'm unable to process your refund request at this time. Please try again later or contact our support team directly.", "confidence": 0.3 },
      "duration_ms": 820,
      "timestamp_utc": "2026-04-22T11:52:02.004Z",
      "exception": null,
      "inspection": {
        "is_silent_failure": false,
        "missing_fields": [],
        "empty_fields": [],
        "type_mismatches": [],
        "severity": "warning",
        "message": "Degraded input from knowledge_retriever",
        "unannotated_successors": [],
        "suspicious_empty_keys": [],
        "tool_failures": [],
        "has_tool_failure": false,
        "semantic_signals": [],
        "degraded_fields": ["kb_articles"],
        "degraded_upstream_node": "knowledge_retriever"
      },
      "attempt_index": 0,
      "validator_results": [],
      "is_subgraph_entry": false,
      "subgraph_run_id": null,
      "llm_usage": null,
      "behavior_type": "detailed_text",
      "anomaly_signals": []
    }
  ],
  "parent_run_id": null,
  "replay_from_step": null,
  "is_cyclic": false,
  "subgraph_run_ids": [],
  "interrupted": false,
  "interrupt_node": null,
  "total_llm_calls": 1,
  "total_tokens": 847,
  "total_cost_usd": 0.0042,
  "correlation": {
    "run_id": "run-silent-001",
    "degradation_origins": [
      {
        "node_name": "knowledge_retriever",
        "step_index": 1,
        "signal_types": ["field_drop", "tool_failure"],
        "confidence": 0.91,
        "reason": "KB timeout caused missing kb_articles field"
      }
    ],
    "propagation_chains": [
      {
        "chain_type": "tool_failure_cascade",
        "nodes": ["knowledge_retriever", "response_drafter"],
        "links": [
          {
            "source_node": "knowledge_retriever",
            "target_node": "response_drafter",
            "signal_type": "field_drop",
            "confidence": 0.91,
            "evidence": "kb_articles field missing from output, required by response_drafter"
          }
        ],
        "summary": "Tool failure in knowledge_retriever dropped required field, causing response_drafter to receive degraded input"
      }
    ],
    "causal_summary": "A knowledge base timeout at the knowledge_retriever node silently dropped the kb_articles field, propagating degraded state to response_drafter.",
    "timeline": [
      { "step_index": 0, "node_name": "ingest", "event_type": "node_ok", "label": "Parsed input", "signal_summary": "" },
      { "step_index": 1, "node_name": "knowledge_retriever", "event_type": "degradation_onset", "label": "KB timeout", "signal_summary": "tool_failure: error_response, field_drop: kb_articles" },
      { "step_index": 2, "node_name": "response_drafter", "event_type": "propagation", "label": "Degraded fallback", "signal_summary": "degraded_input: kb_articles missing" }
    ],
    "replay_impact": null
  },
  "llm_investigation": {
    "triggered": true,
    "trigger_reasons": ["silent_failure_detected", "tool_failure_found"],
    "root_cause_explanation": "The knowledge_retriever node experienced a timeout when querying the knowledge base API, causing it to return an error response with kb_articles set to null. This missing field was required by the downstream response_drafter node, which then produced a degraded fallback response without KB context.",
    "causal_hypotheses": [
      {
        "hypothesis": "KB API latency spike caused timeout",
        "confidence": 0.85,
        "supporting_evidence": ["5000ms timeout exceeded", "error_response in tool_failures", "KB service health check shows intermittent latency"],
        "category": "external_dependency"
      },
      {
        "hypothesis": "Missing fallback logic in retriever node",
        "confidence": 0.72,
        "supporting_evidence": ["Node returned error key instead of raising exception", "No retry logic detected", "Partial response passed downstream"],
        "category": "error_handling"
      }
    ],
    "degradation_narrative": "The pipeline began normally with ingest correctly parsing the customer query. At step 1, knowledge_retriever attempted to fetch relevant KB articles but the knowledge base API timed out. Rather than raising an exception, the node returned a partial response containing an error key and null kb_articles. ARGUS detected this as a silent failure because response_drafter requires the kb_articles field. The response_drafter then received degraded input and produced a generic fallback response that lacked the specific policy information needed to handle the refund request.",
    "observations": [
      "knowledge_retriever timeout at 5000ms suggests KB service latency issue",
      "Node swallowed the error instead of propagating it as an exception",
      "response_drafter has no explicit handling for missing kb_articles",
      "Response confidence dropped to 0.3, indicating the model recognized context was missing"
    ],
    "debugging_suggestions": [
      "[knowledge_retriever] Add retry logic with exponential backoff for KB API calls — start with 3 retries, 1s/2s/4s delays",
      "[knowledge_retriever] Implement a circuit breaker pattern to fail fast when KB is consistently slow",
      "[knowledge_retriever] Raise an explicit exception on timeout instead of returning partial data — let the orchestrator handle retry/fallback",
      "[response_drafter] Add explicit check for kb_articles presence and return a structured error response with suggested actions for the user"
    ],
    "confidence": 0.82,
    "suggested_signatures": [
      {
        "pattern": "(?i)^(I('m| am) sorry|unfortunately|I cannot|I'm unable).*",
        "match_strategy": "regex",
        "proposed_category": "placeholder_outputs",
        "severity": "critical",
        "description": "Detects common LLM apology/refusal patterns indicating failed substantive response",
        "evidence": ["I apologize, but I'm unable to process your refund request at this time."],
        "confidence": 0.87,
        "reasoning": "This pattern consistently appears when context is missing and the LLM falls back to generic responses"
      }
    ],
    "model_used": "gpt-4o-mini",
    "prompt_tokens": 1847,
    "completion_tokens": 623,
    "investigation_duration_ms": 3241,
    "error": null
  }
}
```

### Run: run-silent-001-replay (The "fixed" version for Compare)
```json
{
  "run_id": "run-silent-001-replay",
  "argus_version": "0.3.5",
  "started_at": "2026-04-22T12:05:00.000Z",
  "completed_at": "2026-04-22T12:05:01.847Z",
  "duration_ms": 1847,
  "overall_status": "clean",
  "first_failure_step": null,
  "root_cause_chain": [],
  "graph_node_names": ["ingest", "knowledge_retriever", "response_drafter"],
  "graph_edge_map": {
    "ingest": ["knowledge_retriever"],
    "knowledge_retriever": ["response_drafter"],
    "response_drafter": []
  },
  "initial_state": {
    "query": "I need a refund for order #7781",
    "account_id": "acct_7781",
    "channel": "chat"
  },
  "steps": [
    {
      "step_index": 0,
      "node_name": "ingest",
      "status": "pass",
      "input_state": { "query": "I need a refund for order #7781", "account_id": "acct_7781", "channel": "chat" },
      "output_dict": { "intent": "refund_request", "account_id": "acct_7781", "priority": "p2" },
      "duration_ms": 172,
      "timestamp_utc": "2026-04-22T12:05:00.015Z",
      "exception": null,
      "inspection": { "is_silent_failure": false, "missing_fields": [], "empty_fields": [], "type_mismatches": [], "severity": "ok", "message": "All checks passed", "unannotated_successors": [], "suspicious_empty_keys": [], "tool_failures": [], "has_tool_failure": false, "semantic_signals": [], "degraded_fields": [], "degraded_upstream_node": null },
      "attempt_index": 0,
      "validator_results": [],
      "is_subgraph_entry": false,
      "subgraph_run_id": null
    },
    {
      "step_index": 1,
      "node_name": "knowledge_retriever",
      "status": "pass",
      "input_state": { "intent": "refund_request", "account_id": "acct_7781", "priority": "p2" },
      "output_dict": {
        "kb_articles": [
          { "id": "kb-102", "title": "Refund Policy", "content": "Customers are eligible for a full refund within 30 days of purchase..." },
          { "id": "kb-215", "title": "Order Cancellation Process", "content": "To cancel an order, navigate to Order History..." }
        ]
      },
      "duration_ms": 893,
      "timestamp_utc": "2026-04-22T12:05:00.910Z",
      "exception": null,
      "inspection": { "is_silent_failure": false, "missing_fields": [], "empty_fields": [], "type_mismatches": [], "severity": "ok", "message": "All checks passed", "unannotated_successors": [], "suspicious_empty_keys": [], "tool_failures": [], "has_tool_failure": false, "semantic_signals": [], "degraded_fields": [], "degraded_upstream_node": null },
      "attempt_index": 0,
      "validator_results": [],
      "is_subgraph_entry": false,
      "subgraph_run_id": null
    },
    {
      "step_index": 2,
      "node_name": "response_drafter",
      "status": "pass",
      "input_state": {
        "intent": "refund_request",
        "account_id": "acct_7781",
        "kb_articles": [
          { "id": "kb-102", "title": "Refund Policy", "content": "Customers are eligible for a full refund within 30 days of purchase..." },
          { "id": "kb-215", "title": "Order Cancellation Process", "content": "To cancel an order, navigate to Order History..." }
        ]
      },
      "output_dict": {
        "response": "Based on our refund policy, you're eligible for a full refund for order #7781 since it's within the 30-day window. I've initiated the refund process. You should see the credit in your account within 3-5 business days. Is there anything else I can help you with?",
        "confidence": 0.94
      },
      "duration_ms": 782,
      "timestamp_utc": "2026-04-22T12:05:01.810Z",
      "exception": null,
      "inspection": { "is_silent_failure": false, "missing_fields": [], "empty_fields": [], "type_mismatches": [], "severity": "ok", "message": "All checks passed", "unannotated_successors": [], "suspicious_empty_keys": [], "tool_failures": [], "has_tool_failure": false, "semantic_signals": [], "degraded_fields": [], "degraded_upstream_node": null },
      "attempt_index": 0,
      "validator_results": [],
      "is_subgraph_entry": false,
      "subgraph_run_id": null
    }
  ],
  "parent_run_id": "run-silent-001",
  "replay_from_step": "knowledge_retriever",
  "is_cyclic": false,
  "subgraph_run_ids": [],
  "interrupted": false,
  "interrupt_node": null,
  "llm_investigation": null,
  "correlation": null
}
```

### Run list summaries (for sidebar/list):
```json
[
  { "run_id": "run-silent-001", "overall_status": "silent_failure", "started_at": "2026-04-22T11:52:00Z", "duration_ms": 2091, "step_count": 3, "first_failure_step": "knowledge_retriever", "graph_node_names": ["ingest", "knowledge_retriever", "response_drafter"], "argus_version": "0.3.5", "parent_run_id": null },
  { "run_id": "run-clean-001", "overall_status": "clean", "started_at": "2026-04-22T11:50:00Z", "duration_ms": 1002, "step_count": 4, "first_failure_step": null, "graph_node_names": ["ingest", "classify", "draft", "finalize"], "argus_version": "0.3.5", "parent_run_id": null },
  { "run_id": "run-crash-001", "overall_status": "crashed", "started_at": "2026-04-22T11:48:00Z", "duration_ms": 820, "step_count": 3, "first_failure_step": "draft", "graph_node_names": ["ingest", "classify", "draft", "finalize"], "argus_version": "0.3.5", "parent_run_id": null },
  { "run_id": "run-parallel-001", "overall_status": "silent_failure", "started_at": "2026-04-22T11:45:00Z", "duration_ms": 3120, "step_count": 4, "first_failure_step": "fetch_b", "graph_node_names": ["ingest", "fetch_a", "fetch_b", "merge"], "argus_version": "0.3.5", "parent_run_id": null },
  { "run_id": "run-cycle-001", "overall_status": "silent_failure", "started_at": "2026-04-22T11:40:00Z", "duration_ms": 4550, "step_count": 6, "first_failure_step": "decide", "graph_node_names": ["ingest", "check", "decide", "check", "decide", "finalize"], "argus_version": "0.3.5", "parent_run_id": null }
]
```

---

## 9. Interactions & Constraints

### What's clickable:
- **Sidebar nav**: Runs, Compare, Approvals, Changelog are navigable
- **Run list**: Only `run-silent-001` (first row) opens the detail panel
- **Other runs**: Show a subtle tooltip on hover: "Click the first run to explore" or slightly dimmed
- **Run detail tabs**: All 6 tabs are switchable with real content
- **Replay button**: Triggers mock animation sequence
- **Compare tabs**: All 7 tabs switchable with real content
- **Approval actions**: Private/Shared/Reject work (client-side state)
- **Feedback actions**: Agree/Disagree/Dismiss work (client-side state)

### What's NOT clickable / disabled:
- "soon" nav items (Traces, Evaluation, Graphs, Alerts, Datasets, Settings)
- Runs 2-5 in the list (show them but don't open detail)
- Search input (decorative)
- Filters button (decorative)
- Time range dropdown (decorative)
- Guide, Report Board in sidebar

### Transitions:
- Page changes: `pageFadeIn` animation (200ms)
- Detail panel: slide in from right (200ms)
- Tab switches: instant content swap
- Replay animation: staged banners with pulse

### Responsive:
- Sidebar: always visible at 220px
- At <1024px: detail panel becomes overlay (slide from right, backdrop blur)
- Mobile: sidebar collapses (optional — main target is desktop demo)

---

## 10. Tech Stack

Build this as a **Next.js** app (same as the real ARGUS UI) or a **standalone React/Vite** app — either works.

### Required dependencies:
- `next` or `vite` + `react`
- `tailwindcss` (v3+)
- `lucide-react` for icons
- `geist` font package (or load via Google Fonts)
- `@fontsource/jetbrains-mono` or Google Fonts

### No backend needed — all data is inline mock JSON.

### File structure suggestion:
```
/app (or /src)
├── layout.tsx           (sidebar + main area)
├── page.tsx             (runs page — master-detail)
├── compare/page.tsx     (compare page)
├── approvals/page.tsx   (approvals page)
├── changelog/page.tsx   (changelog page)
├── components/
│   ├── Sidebar.tsx
│   ├── RunListPanel.tsx
│   ├── RunDetailPanel.tsx
│   ├── StatusBadge.tsx
│   ├── JsonViewer.tsx
│   ├── compare/
│   │   ├── CompareHeader.tsx
│   │   ├── CompareTabNav.tsx
│   │   └── tabs/ (OverviewTab, MetricsTab, DiffViewTab, etc.)
│   └── run-detail/
│       ├── OverviewTab.tsx
│       ├── PipelineTab.tsx
│       ├── AIAnalysisPanel.tsx
│       ├── CorrelationPanel.tsx
│       └── ExecutionTimeline.tsx
├── data/
│   └── mock.ts          (all mock data exported as constants)
├── lib/
│   ├── types.ts         (TypeScript interfaces)
│   └── utils.ts         (format helpers)
└── globals.css          (design system)
```

---

## Summary of the Demo Flow

A visitor to the website sees:

1. **Runs page** loads with 5 runs in the list, detail panel shows "Select a run"
2. They click the first run (silent failure) → detail slides in
3. They explore Overview, Pipeline (see the silent failure chain), AI Analysis
4. They click **Replay** → animated mock shows "Rerunning..." → "Complete!"
5. They click "View comparison" → navigate to Compare page
6. Compare page shows the original vs fixed run, all tabs explorable
7. They navigate to **Approvals** → see pending patterns, click Private/Shared
8. They check **Changelog** → see the full version history

This gives a complete hands-on feel of ARGUS without any backend or real data.
