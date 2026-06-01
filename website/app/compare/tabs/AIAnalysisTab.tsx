'use client'

import { useState } from 'react'
import type { RunRecord, LLMInvestigationResult } from '@/lib/types'

const C_GREEN = '#3d9e7d'
const C_AMBER = '#d49a2e'
const C_RED = '#d65c5c'
const C_INDIGO = '#7c7fc7'

function renderWithCode(text: string): (string | JSX.Element)[] {
  const codeRe = /`([^`]+)`|(\b[a-z_]\w*\s*\([^)]*\))|(\b[A-Z][A-Z0-9_]{2,}\b)|(\b\w+\.\w+(?:\.\w+)+\b)/g
  const parts: (string | JSX.Element)[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = codeRe.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const code = m[1] ?? m[0]
    parts.push(
      <code
        key={m.index}
        className="text-[12px] font-mono px-1.5 py-0.5 rounded"
        style={{ background: 'rgba(124,127,199,0.06)', color: '#818cf8', border: '1px solid rgba(124,127,199,0.12)' }}
      >
        {code}
      </code>
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length > 0 ? parts : [text]
}

function confColor(c: number) {
  return c >= 0.75 ? C_GREEN : c >= 0.45 ? C_AMBER : '#5d6370'
}

function AnalysisPanel({ inv, run, label }: { inv: LLMInvestigationResult; run: RunRecord; label: string }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const hasError = !!inv.error
  const isHealthy = !hasError && run.overall_status === 'clean'
  const cc = confColor(inv.confidence)

  return (
    <div className="card rounded-xl overflow-hidden" style={{ border: '1px solid rgba(124,127,199,0.15)' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2.5" style={{ background: 'rgba(124,127,199,0.04)' }}>
        <div className="w-1 h-4 rounded-full" style={{ background: C_INDIGO }} />
        <span className="text-[12px] font-semibold" style={{ color: C_INDIGO }}>{label}</span>
        {!hasError && (
          <span
            className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ color: cc, background: `${cc}12`, border: `1px solid ${cc}25` }}
          >
            {(inv.confidence * 100).toFixed(0)}% confidence
          </span>
        )}
      </div>

      <div className="px-4 pb-4 space-y-4">
        {/* Error */}
        {hasError && (
          <div className="mt-3 p-3 rounded-lg text-[12px]" style={{ background: 'rgba(214,92,92,0.04)', border: '1px solid rgba(214,92,92,0.12)' }}>
            <span className="font-semibold" style={{ color: C_RED }}>Analysis failed: </span>
            <span style={{ color: '#b91c1c' }}>{inv.error}</span>
          </div>
        )}

        {/* Healthy */}
        {!hasError && isHealthy && inv.root_cause_explanation && (
          <div className="mt-3 p-4 rounded-lg" style={{ background: 'rgba(61,158,125,0.04)', border: '1px solid rgba(61,158,125,0.12)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: C_GREEN }} className="text-base">{'\u2713'}</span>
              <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: C_GREEN }}>Pipeline healthy</span>
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{inv.root_cause_explanation}</p>
          </div>
        )}

        {/* Failure analysis */}
        {!hasError && !isHealthy && (
          <div className="mt-3 space-y-4">
            {/* Root Cause Node */}
            {(run.root_cause_chain?.length > 0 || run.first_failure_step) && (
              <div>
                <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>Root Cause Node:</span>
                <span
                  className="ml-2 text-[11px] font-mono px-2 py-0.5 rounded"
                  style={{ background: 'rgba(214,92,92,0.08)', color: C_RED, border: '1px solid rgba(214,92,92,0.2)' }}
                >
                  {run.root_cause_chain?.[0] ?? run.first_failure_step}
                </span>
              </div>
            )}

            {/* Root Cause Reason */}
            {inv.root_cause_explanation && (
              <div>
                <p className="text-[12px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Root Cause:</p>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{inv.root_cause_explanation}</p>
              </div>
            )}

            {/* Narrative */}
            {inv.degradation_narrative && (
              <div>
                <p className="text-[12px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>What Happened:</p>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{inv.degradation_narrative}</p>
              </div>
            )}

            {/* Suggested Fixes */}
            {inv.debugging_suggestions.length > 0 && (
              <div>
                <p className="text-[12px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Suggested Fixes:</p>
                <div className="space-y-2">
                  {inv.debugging_suggestions.map((s, i) => {
                    const nodeMatch = s.match(/^\[([^\]]+)\]\s*/)
                    const nodeName = nodeMatch ? nodeMatch[1] : null
                    const rest = nodeName ? s.slice(nodeMatch![0].length) : s
                    const codeIdx = rest.indexOf('\n    ')
                    let description: string
                    let codePart: string | null
                    if (codeIdx >= 0) {
                      description = rest.slice(0, codeIdx)
                      codePart = rest.slice(codeIdx).trim()
                    } else {
                      description = rest
                      codePart = null
                    }

                    return (
                      <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                        <div className="flex items-start gap-2">
                          <span
                            className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5"
                            style={{ background: `${C_GREEN}15`, color: C_GREEN, border: `1px solid ${C_GREEN}30` }}
                          >
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-1.5 flex-wrap">
                              {nodeName && (
                                <span
                                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: 'rgba(124,127,199,0.1)', color: '#8b6fb5', border: '1px solid rgba(154,109,198,0.2)' }}
                                >
                                  {nodeName}
                                </span>
                              )}
                              <span className="text-[12px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
                                {renderWithCode(description)}
                              </span>
                            </div>
                            {codePart && (
                              <pre
                                className="mt-2 px-3 py-2 rounded-lg text-[11px] font-mono overflow-x-auto whitespace-pre-wrap"
                                style={{ background: 'rgba(0,0,0,0.15)', color: '#818cf8', border: '1px solid rgba(124,127,199,0.1)' }}
                              >
                                {codePart}
                              </pre>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Causal Hypotheses */}
        {!hasError && inv.causal_hypotheses.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="flex items-center gap-2 text-[11px] hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              <span className="text-[10px]">{detailsOpen ? '\u25BE' : '\u25B8'}</span>
              <span>Causal Hypotheses ({inv.causal_hypotheses.length})</span>
              {inv.observations.length > 0 && (
                <span className="ml-1">&middot; {inv.observations.length} observations</span>
              )}
            </button>

            {detailsOpen && (
              <div className="mt-3 space-y-2">
                {inv.causal_hypotheses.map((h, i) => {
                  const hc = confColor(h.confidence)
                  return (
                    <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: hc, background: `${hc}12` }}>
                          {(h.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium" style={{ background: 'rgba(124,127,199,0.06)', color: C_INDIGO }}>
                          {h.category}
                        </span>
                      </div>
                      <div className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{h.hypothesis}</div>
                      {h.supporting_evidence.length > 0 && (
                        <div className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          Evidence: {h.supporting_evidence.join(', ')}
                        </div>
                      )}
                    </div>
                  )
                })}

                {inv.observations.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Observations</div>
                    <div className="space-y-1">
                      {inv.observations.map((o, i) => (
                        <div key={i} className="flex items-baseline gap-2 text-[11px]">
                          <span style={{ color: 'var(--text-faint)' }}>&middot;</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{o}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Meta */}
        {!hasError && (
          <div className="flex items-center gap-4 pt-2 text-[10px] font-mono" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border-subtle)' }}>
            {inv.prompt_tokens > 0 && <span>{inv.prompt_tokens + inv.completion_tokens} tokens</span>}
            {inv.investigation_duration_ms > 0 && <span>{(inv.investigation_duration_ms / 1000).toFixed(1)}s</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function ComparativeSummary({ invA, invB, runA, runB }: { invA: LLMInvestigationResult; invB: LLMInvestigationResult; runA: RunRecord; runB: RunRecord }) {
  const confDelta = invB.confidence - invA.confidence
  const aFailed = runA.overall_status !== 'clean'
  const bFailed = runB.overall_status !== 'clean'
  const fixed = aFailed && !bFailed
  const regressed = !aFailed && bFailed
  const bothFailed = aFailed && bFailed

  const rootCauseChanged = invA.root_cause_explanation !== invB.root_cause_explanation
  const fixCountA = invA.debugging_suggestions?.length ?? 0
  const fixCountB = invB.debugging_suggestions?.length ?? 0

  return (
    <div className="card rounded-xl overflow-hidden" style={{ border: `1px solid ${fixed ? 'rgba(61,158,125,0.2)' : regressed ? 'rgba(214,92,92,0.2)' : 'var(--border-subtle)'}` }}>
      <div
        className="px-4 py-3 flex items-center gap-2.5"
        style={{ background: fixed ? 'rgba(61,158,125,0.04)' : regressed ? 'rgba(214,92,92,0.04)' : 'var(--bg-elevated)' }}
      >
        <span className="text-[14px]">{fixed ? '\u2713' : regressed ? '\u2717' : '\u2194'}</span>
        <span className="text-[13px] font-bold" style={{ color: fixed ? C_GREEN : regressed ? C_RED : 'var(--text-primary)' }}>
          {fixed ? 'Issue Resolved in Replay' : regressed ? 'Regression Detected' : 'Comparative Summary'}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Status transition */}
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Status:</span>
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ color: aFailed ? C_RED : C_GREEN, background: aFailed ? `${C_RED}10` : `${C_GREEN}10` }}
          >
            {runA.overall_status}
          </span>
          <span style={{ color: 'var(--text-faint)' }}>{'\u2192'}</span>
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ color: bFailed ? C_RED : C_GREEN, background: bFailed ? `${C_RED}10` : `${C_GREEN}10` }}
          >
            {runB.overall_status}
          </span>
        </div>

        {/* Confidence delta */}
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Confidence:</span>
          <span className="font-mono font-bold" style={{ color: confColor(invA.confidence) }}>
            {(invA.confidence * 100).toFixed(0)}%
          </span>
          <span style={{ color: 'var(--text-faint)' }}>{'\u2192'}</span>
          <span className="font-mono font-bold" style={{ color: confColor(invB.confidence) }}>
            {(invB.confidence * 100).toFixed(0)}%
          </span>
          {confDelta !== 0 && (
            <span className="text-[11px] font-medium" style={{ color: confDelta > 0 ? C_GREEN : C_RED }}>
              ({confDelta > 0 ? '+' : ''}{(confDelta * 100).toFixed(0)}%)
            </span>
          )}
        </div>

        {/* Root cause change */}
        {rootCauseChanged && bothFailed && (
          <div className="text-[12px]">
            <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Root cause changed between runs</span>
          </div>
        )}

        {/* Fixes comparison */}
        {(fixCountA > 0 || fixCountB > 0) && (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Suggested fixes:</span>
            <span style={{ color: 'var(--text-secondary)' }}>{fixCountA} (base)</span>
            <span style={{ color: 'var(--text-faint)' }}>{'\u2192'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{fixCountB} (replay)</span>
          </div>
        )}

        {/* Trigger reasons diff */}
        {invA.trigger_reasons?.length > 0 && (
          <div className="text-[12px]">
            <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Base triggers: </span>
            <span style={{ color: 'var(--text-secondary)' }}>{invA.trigger_reasons.join(', ')}</span>
          </div>
        )}
        {invB.trigger_reasons?.length > 0 && (
          <div className="text-[12px]">
            <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Replay triggers: </span>
            <span style={{ color: 'var(--text-secondary)' }}>{invB.trigger_reasons.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AIAnalysisTab({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const invA = runA.llm_investigation
  const invB = runB.llm_investigation

  if (!invA?.triggered && !invB?.triggered) {
    return (
      <div className="py-16 text-center">
        <div className="text-[28px] mb-3" style={{ color: 'var(--text-faint)' }}>{'\u2B50'}</div>
        <p className="text-[13px] font-medium" style={{ color: 'var(--text-muted)' }}>No AI analysis available for these runs.</p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
          AI analysis is triggered automatically when failures are detected during a run.
        </p>
      </div>
    )
  }

  const bothTriggered = invA?.triggered && invB?.triggered

  return (
    <div className="py-4 space-y-4">
      {/* Comparative summary when both have analysis */}
      {bothTriggered && (
        <ComparativeSummary invA={invA!} invB={invB!} runA={runA} runB={runB} />
      )}

      {/* Side-by-side analysis panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Run A */}
        {invA?.triggered ? (
          <AnalysisPanel inv={invA} run={runA} label="Base Run Analysis" />
        ) : (
          <div className="card rounded-xl p-6 flex items-center justify-center" style={{ border: '1px solid var(--border-subtle)' }}>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No AI analysis triggered for the base run.</p>
          </div>
        )}

        {/* Run B */}
        {invB?.triggered ? (
          <AnalysisPanel inv={invB} run={runB} label="Replay Analysis" />
        ) : (
          <div className="card rounded-xl p-6 flex items-center justify-center" style={{ border: '1px solid var(--border-subtle)' }}>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No AI analysis triggered for the replay.</p>
          </div>
        )}
      </div>

      {/* Suggested signatures comparison */}
      {bothTriggered && ((invA!.suggested_signatures?.length ?? 0) > 0 || (invB!.suggested_signatures?.length ?? 0) > 0) && (
        <div className="card rounded-xl overflow-hidden">
          <div className="px-4 py-2.5" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>Suggested Failure Signatures</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {[{ sigs: invA!.suggested_signatures ?? [], label: 'Base Run' }, { sigs: invB!.suggested_signatures ?? [], label: 'Replay' }].map(({ sigs, label }) => (
              <div key={label} className="p-3" style={{ borderRight: '1px solid var(--border-subtle)' }}>
                <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>{label}</div>
                {sigs.length === 0 ? (
                  <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>None suggested</p>
                ) : (
                  <div className="space-y-2">
                    {sigs.map((sig, i) => (
                      <div key={i} className="p-2 rounded-lg text-[11px]" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                            style={{
                              color: sig.severity === 'critical' ? C_RED : C_AMBER,
                              background: sig.severity === 'critical' ? `${C_RED}10` : `${C_AMBER}10`,
                            }}
                          >
                            {sig.severity}
                          </span>
                          <span className="font-mono font-medium" style={{ color: C_INDIGO }}>{sig.match_strategy}</span>
                        </div>
                        <p style={{ color: 'var(--text-secondary)' }}>{sig.description}</p>
                        <code className="block mt-1 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{sig.pattern}</code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
