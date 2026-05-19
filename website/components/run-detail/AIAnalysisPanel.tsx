'use client'

import { useState } from 'react'
import type { RunRecord } from '@/lib/types'

const C_GREEN = '#10b981'
const C_AMBER = '#f59e0b'

/** Render text with inline code spans highlighted */
function renderWithCode(text: string): (string | JSX.Element)[] {
  // Match: `backtick code`, function_name(...), UPPER_SNAKE, module.attr patterns
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
        style={{
          background: 'rgba(99,102,241,0.06)',
          color: '#818cf8',
          border: '1px solid rgba(99,102,241,0.12)',
        }}
      >
        {code}
      </code>
    )
    last = m.index + m[0].length
  }

  if (last < text.length) parts.push(text.slice(last))
  return parts.length > 0 ? parts : [text]
}

export default function AIAnalysisPanel({ run }: { run: RunRecord }) {
  const inv = run.llm_investigation
  const [detailsOpen, setDetailsOpen] = useState(false)

  if (!inv || !inv.triggered) return null

  const hasError = !!inv.error
  const isHealthy = !hasError && run.overall_status === 'clean'

  const confColor =
    inv.confidence >= 0.75 ? C_GREEN : inv.confidence >= 0.45 ? C_AMBER : '#9ca3af'

  return (
    <div
      className="card rounded-xl overflow-hidden"
      style={{
        border: '1px solid rgba(99,102,241,0.15)',
      }}
    >
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center gap-3" style={{ background: 'rgba(99,102,241,0.04)' }}>
        <div className="w-1 h-4 rounded-full" style={{ background: '#6366f1' }} />
        <span className="text-[13px] font-semibold" style={{ color: '#6366f1' }}>
          AI Analysis
        </span>
        {!hasError && (
          <span
            className="ml-auto text-[11px] font-medium px-2.5 py-0.5 rounded-full"
            style={{
              color: confColor,
              background: `${confColor}12`,
              border: `1px solid ${confColor}25`,
            }}
          >
            {(inv.confidence * 100).toFixed(0)}% confidence
          </span>
        )}
      </div>

      <div className="px-5 pb-6 space-y-6">

        {/* Error state */}
        {hasError && (
          <div className="mt-4 p-4 rounded-lg text-[13px]"
            style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)' }}>
            <span className="font-semibold" style={{ color: '#ef4444' }}>Analysis failed: </span>
            <span style={{ color: '#b91c1c' }}>{inv.error}</span>
          </div>
        )}

        {/* Healthy run */}
        {!hasError && isHealthy && inv.root_cause_explanation && (
          <div className="mt-4 p-5 rounded-xl"
            style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)' }}>
            <div className="flex items-center gap-2.5 mb-3">
              <span style={{ color: C_GREEN }} className="text-lg">{'\u2713'}</span>
              <span className="text-[12px] uppercase tracking-widest font-semibold" style={{ color: C_GREEN }}>
                Pipeline healthy
              </span>
            </div>
            <p className="text-[14px] leading-relaxed" style={{ color: 'var(--text-secondary)', maxWidth: '680px' }}>
              {inv.root_cause_explanation}
            </p>
          </div>
        )}

        {/* Root cause breakdown */}
        {!hasError && !isHealthy && (
          <div className="mt-4 space-y-5">

            {/* Root Cause Node */}
            {(run.root_cause_chain?.length > 0 || run.first_failure_step) && (
              <div>
                <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  Root Cause Node:
                </span>
                <span
                  className="ml-2 text-[12.5px] font-mono px-2 py-0.5 rounded"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  {run.root_cause_chain?.[0] ?? run.first_failure_step}
                </span>
              </div>
            )}

            {/* Root Cause Reason */}
            {inv.root_cause_explanation && (
              <div>
                <p className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Root Cause Reason:
                </p>
                <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--text-secondary)', maxWidth: '680px' }}>
                  {inv.root_cause_explanation}
                </p>
              </div>
            )}

            {/* Forensic Narrative */}
            {inv.degradation_narrative && (
              <div>
                <p className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  What Happened:
                </p>
                <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--text-secondary)', maxWidth: '680px' }}>
                  {inv.degradation_narrative}
                </p>
              </div>
            )}

            {/* Fix */}
            {inv.debugging_suggestions.length > 0 && (
              <div>
                <p className="text-[13px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                  Suggested Fixes:
                </p>
                <div className="space-y-3">
                  {inv.debugging_suggestions.map((s, i) => {
                    // Parse: "[node] what — why\n    code_hint"
                    // Also handles: "[node] what. — why." or plain text
                    const nodeMatch = s.match(/^\[([^\]]+)\]\s*/)
                    const nodeName = nodeMatch ? nodeMatch[1] : null
                    const rest = nodeName ? s.slice(nodeMatch![0].length) : s

                    // Extract code block: newline-indented or after "add:" / "example:" / "e.g."
                    const codeIdx = rest.indexOf('\n    ')
                    const inlineCodeMatch = codeIdx < 0
                      ? rest.match(/\b(add:|example:|e\.g\.\s*|such as:\s*|try:\s*)(.+)$/i)
                      : null

                    let description: string
                    let codePart: string | null

                    if (codeIdx >= 0) {
                      description = rest.slice(0, codeIdx)
                      codePart = rest.slice(codeIdx).trim()
                    } else if (inlineCodeMatch) {
                      description = rest.slice(0, inlineCodeMatch.index).trimEnd().replace(/[.,]\s*$/, '')
                      codePart = inlineCodeMatch[2].trim()
                    } else {
                      description = rest
                      codePart = null
                    }

                    // Split on " — " or " - " (em-dash or regular dash with spaces)
                    const emDashIdx = description.indexOf(' \u2014 ')
                    const regDashIdx = emDashIdx < 0 ? description.indexOf(' - ') : -1
                    const dashIdx = emDashIdx >= 0 ? emDashIdx : regDashIdx
                    const dashLen = emDashIdx >= 0 ? 3 : 3

                    const whatPart = dashIdx >= 0 ? description.slice(0, dashIdx) : description
                    const whyPart = dashIdx >= 0 ? description.slice(dashIdx + dashLen) : null

                    return (
                      <div
                        key={i}
                        className="p-4 rounded-lg"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                            style={{ background: `${C_GREEN}15`, color: C_GREEN, border: `1px solid ${C_GREEN}30` }}
                          >
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 flex-wrap mb-1">
                              {nodeName && (
                                <span
                                  className="inline-flex items-center shrink-0 text-[11px] font-mono font-bold px-2 py-0.5 rounded mt-0.5"
                                  style={{
                                    background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.10))',
                                    color: '#7c3aed',
                                    border: '1px solid rgba(139,92,246,0.2)',
                                    letterSpacing: '0.01em',
                                  }}
                                >
                                  {nodeName}
                                </span>
                              )}
                              <span className="text-[13.5px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
                                {renderWithCode(whatPart)}
                              </span>
                            </div>
                            {whyPart && (
                              <p className="text-[12.5px] leading-relaxed mt-1.5" style={{ color: 'var(--text-muted)' }}>
                                {renderWithCode(whyPart)}
                              </p>
                            )}
                            {codePart && (
                              <pre
                                className="mt-2.5 px-3.5 py-3 rounded-lg text-[12px] font-mono overflow-x-auto whitespace-pre-wrap"
                                style={{
                                  background: 'rgba(0,0,0,0.03)',
                                  color: '#818cf8',
                                  border: '1px solid rgba(99,102,241,0.1)',
                                  lineHeight: '1.7',
                                }}
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

        {/* Causal hypotheses */}
        {!hasError && inv.causal_hypotheses.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="flex items-center gap-2 text-[12px] hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              <span className="text-[10px]">{detailsOpen ? '\u25BE' : '\u25B8'}</span>
              <span>Causal Hypotheses ({inv.causal_hypotheses.length})</span>
              {inv.observations.length > 0 && (
                <span className="ml-1" style={{ color: 'var(--text-muted)' }}>&middot; {inv.observations.length} observation{inv.observations.length !== 1 ? 's' : ''}</span>
              )}
            </button>

            {detailsOpen && (
              <div className="mt-4 space-y-3">
                {inv.causal_hypotheses.map((h, i) => {
                  const hc = h.confidence >= 0.7 ? C_GREEN : h.confidence >= 0.4 ? C_AMBER : '#9ca3af'
                  return (
                    <div
                      key={i}
                      className="p-4 rounded-lg"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                    >
                      <div className="flex items-center gap-2.5 mb-2">
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                          style={{ color: hc, background: `${hc}12` }}
                        >
                          {(h.confidence * 100).toFixed(0)}%
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ background: 'rgba(99,102,241,0.06)', color: '#6366f1' }}
                        >
                          {h.category}
                        </span>
                      </div>
                      <div className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{h.hypothesis}</div>
                      {h.supporting_evidence.length > 0 && (
                        <div className="mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                          Evidence: {h.supporting_evidence.join(', ')}
                        </div>
                      )}
                    </div>
                  )
                })}

                {inv.observations.length > 0 && (
                  <div className="pt-3">
                    <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Observations</div>
                    <div className="space-y-1.5">
                      {inv.observations.map((o, i) => (
                        <div key={i} className="flex items-baseline gap-2 text-[12px]">
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
      </div>
    </div>
  )
}
