'use client'

import type { RunRecord } from '@/lib/types'
import { C_GREEN, C_AMBER, C_RED } from '@/lib/run-utils'

export default function CorrelationPanel({ run }: { run: RunRecord }) {
  const corr = run.correlation
  if (!corr) return null
  if (!corr.degradation_origins.length && !corr.propagation_chains.length) return null

  const primary = corr.degradation_origins[0] ?? null
  const confColor = primary
    ? primary.confidence >= 0.8 ? C_RED : primary.confidence >= 0.5 ? C_AMBER : '#5d6370'
    : '#5d6370'

  return (
    <div>
      {/* Section heading */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
          Correlation
        </span>
        {primary && (
          <span
            className="ml-auto text-[11px] font-medium px-2.5 py-0.5 rounded-full"
            style={{
              color: confColor,
              background: confColor === C_RED ? 'rgba(239,68,68,0.08)' : confColor === C_AMBER ? 'rgba(245,158,11,0.08)' : 'rgba(82,82,94,0.08)',
              border: `1px solid ${confColor === C_RED ? 'rgba(239,68,68,0.2)' : confColor === C_AMBER ? 'rgba(245,158,11,0.2)' : 'rgba(82,82,94,0.2)'}`,
            }}
          >
            {(primary.confidence * 100).toFixed(0)}% confidence
          </span>
        )}
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="p-5 space-y-5">
          {/* Origin */}
          {primary && (
            <div>
              <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                Origin
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className="font-mono text-[13px] font-bold px-2.5 py-1 rounded-lg"
                  style={{ color: confColor, background: 'var(--bg-elevated)' }}
                >
                  {primary.node_name}
                </span>
                <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>step {primary.step_index}</span>
              </div>
              {primary.signal_types.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {primary.signal_types.map((sig, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--bg-overlay)', color: 'var(--text-secondary)' }}
                    >
                      {sig}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Propagation chains */}
          {corr.propagation_chains.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                Propagation
              </div>
              <div className="space-y-3">
                {corr.propagation_chains.slice(0, 2).map((chain, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {chain.nodes.map((node, ni) => (
                        <span key={ni} className="flex items-center gap-1.5">
                          <span
                            className="font-mono text-[12px] font-semibold px-2 py-0.5 rounded"
                            style={{ background: 'var(--bg-overlay)', color: 'var(--text-primary)' }}
                          >
                            {node}
                          </span>
                          {ni < chain.nodes.length - 1 && (
                            <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>→</span>
                          )}
                        </span>
                      ))}
                    </div>
                    <span
                      className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                    >
                      {chain.chain_type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Causal summary */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
              Summary
            </div>
            <p className="text-[13px] leading-relaxed italic" style={{ color: '#d4d4d8' }}>
              &ldquo;{corr.causal_summary}&rdquo;
            </p>
          </div>

          {/* Replay impact */}
          {corr.replay_impact && (
            <div>
              <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                Replay Impact
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {corr.replay_impact.improved_nodes.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>improved:</span>
                    {corr.replay_impact.improved_nodes.map((n, i) => (
                      <span
                        key={i}
                        className="font-mono text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(34,197,94,0.08)', color: C_GREEN, border: '1px solid rgba(34,197,94,0.2)' }}
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                )}
                {corr.replay_impact.regressed_nodes.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>regressed:</span>
                    {corr.replay_impact.regressed_nodes.map((n, i) => (
                      <span
                        key={i}
                        className="font-mono text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(239,68,68,0.08)', color: C_RED, border: '1px solid rgba(239,68,68,0.2)' }}
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {corr.replay_impact.summary && (
                <p className="mt-2 text-[12px] italic" style={{ color: 'var(--text-muted)' }}>
                  {corr.replay_impact.summary}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
