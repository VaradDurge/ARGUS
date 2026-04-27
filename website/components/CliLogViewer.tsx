'use client'

import { useState } from 'react'

interface CliLogViewerProps {
  log: string
  runId: string
}

type LogLevel = 'INFO' | 'WARN' | 'WARNING' | 'ERROR' | 'DEBUG' | 'FATAL'

function parseLine(line: string): { timestamp: string; level: LogLevel | null; rest: string } | null {
  if (!line.trim()) return null

  // Match: 2026-04-22T11:50:00.012Z  INFO  ...
  const m = line.match(/^(\S+)\s{2,}(INFO|WARN|WARNING|ERROR|DEBUG|FATAL)\s{2,}(.*)$/)
  if (m) {
    return { timestamp: m[1], level: m[2] as LogLevel, rest: m[3] }
  }
  return { timestamp: '', level: null, rest: line }
}

function levelColor(level: LogLevel | null): string {
  switch (level) {
    case 'INFO':    return '#6b7280'
    case 'DEBUG':   return '#4b5563'
    case 'WARN':
    case 'WARNING': return '#f59e0b'
    case 'ERROR':   return '#ef4444'
    case 'FATAL':   return '#dc2626'
    default:        return '#52525e'
  }
}

function levelBg(level: LogLevel | null): string {
  switch (level) {
    case 'WARN':
    case 'WARNING': return 'rgba(245,158,11,0.08)'
    case 'ERROR':   return 'rgba(239,68,68,0.06)'
    case 'FATAL':   return 'rgba(220,38,38,0.08)'
    default:        return 'transparent'
  }
}

function colorizeRest(rest: string): React.ReactNode[] {
  // Highlight key=value pairs and quoted strings
  const parts: React.ReactNode[] = []
  const regex = /(\w[\w.]*=(?:"[^"]*"|[^\s]*))|("([^"]*)")/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(rest)) !== null) {
    if (match.index > last) {
      parts.push(<span key={last} style={{ color: '#52525e' }}>{rest.slice(last, match.index)}</span>)
    }
    const full = match[0]
    if (match[1]) {
      // key=value
      const eq = full.indexOf('=')
      const key = full.slice(0, eq)
      const val = full.slice(eq + 1)
      parts.push(
        <span key={match.index}>
          <span style={{ color: '#60a5fa' }}>{key}</span>
          <span style={{ color: '#35353e' }}>=</span>
          <span style={{ color: '#86efac' }}>{val}</span>
        </span>
      )
    } else if (match[2]) {
      // quoted string
      parts.push(<span key={match.index} style={{ color: '#e2e2e6' }}>{full}</span>)
    }
    last = match.index + full.length
  }

  if (last < rest.length) {
    parts.push(<span key={last} style={{ color: '#52525e' }}>{rest.slice(last)}</span>)
  }

  return parts
}

export default function CliLogViewer({ log, runId }: CliLogViewerProps) {
  const [collapsed, setCollapsed] = useState(false)

  const lines = log.split('\n').filter((l) => l.trim())
  const parsed = lines.map((l, i) => ({ raw: l, parsed: parseLine(l), i }))

  const hasErrors = parsed.some((p) => p.parsed?.level === 'ERROR' || p.parsed?.level === 'FATAL')
  const hasWarns = parsed.some((p) => p.parsed?.level === 'WARN' || p.parsed?.level === 'WARNING')

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
        boxShadow: '0 10px 24px rgba(0,0,0,0.24)',
      }}
    >
      {/* Terminal titlebar */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center gap-3">
          {/* Traffic lights */}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3a3a40' }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3a3a40' }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3a3a40' }} />
          </div>
          <span className="text-xs font-mono text-[var(--text-secondary)]">{runId}.log</span>
          <div className="flex items-center gap-1.5 ml-1">
            {hasErrors && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {parsed.filter(p => p.parsed?.level === 'ERROR' || p.parsed?.level === 'FATAL').length} err
              </span>
            )}
            {hasWarns && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                {parsed.filter(p => p.parsed?.level === 'WARN' || p.parsed?.level === 'WARNING').length} warn
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          className="text-[10px] text-[var(--text-secondary)] hover:text-white transition-colors font-mono"
        >
          {collapsed ? 'expand' : 'collapse'}
        </button>
      </div>

      {/* Log lines */}
      {!collapsed && (
        <div
          className="px-0 py-2 overflow-x-auto"
          style={{ background: 'var(--bg-surface)' }}
        >
          <div className="font-mono text-xs leading-6 min-w-0">
            {parsed.map(({ raw, parsed: p, i }) => {
              if (!p) return null
              const bg = levelBg(p.level)
              return (
                <div
                  key={i}
                  className="flex items-start gap-0 px-4 py-0.5 group"
                  style={{ background: bg }}
                >
                  {/* Line number */}
                  <span
                    className="shrink-0 w-6 text-right mr-4 select-none"
                    style={{ color: '#35353e' }}
                  >
                    {i + 1}
                  </span>

                  {/* Timestamp */}
                  {p.timestamp && (
                    <span className="shrink-0 mr-3" style={{ color: '#35353e' }}>
                      {p.timestamp}
                    </span>
                  )}

                  {/* Level badge */}
                  {p.level && (
                    <span
                      className="shrink-0 w-8 mr-3 font-semibold"
                      style={{ color: levelColor(p.level) }}
                    >
                      {p.level.slice(0, 4)}
                    </span>
                  )}

                  {/* Rest with syntax highlighting */}
                  <span className="break-all">{colorizeRest(p.rest)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
