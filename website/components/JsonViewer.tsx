'use client'

import { useState } from 'react'

function syntaxHighlight(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[\dA-Fa-f]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        if (/^"/.test(match)) {
          if (/:$/.test(match)) return `<span class="json-key">${match}</span>`
          return `<span class="json-string">${match}</span>`
        }
        if (/true|false/.test(match)) return `<span class="json-boolean">${match}</span>`
        if (/null/.test(match)) return `<span class="json-null">${match}</span>`
        return `<span class="json-number">${match}</span>`
      }
    )
}

interface JsonViewerProps {
  data: unknown
  label?: string
  defaultCollapsed?: boolean
  maxLines?: number
}

export default function JsonViewer({ data, label, defaultCollapsed = true, maxLines = 12 }: JsonViewerProps) {
  const formatted = JSON.stringify(data, null, 2)
  const lines = formatted.split('\n')
  const isLong = lines.length > maxLines
  const [collapsed, setCollapsed] = useState(defaultCollapsed || isLong)

  const preview = lines.slice(0, 3).join('\n') + (isLong ? '\n  ...' : '')
  const highlighted = syntaxHighlight(collapsed && isLong ? preview : formatted)

  return (
    <div className="rounded-lg overflow-hidden text-xs" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}>
      {label && (
        <div className="flex items-center justify-between px-3 py-2 border-b" style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-default)' }}>
          <span className="text-[var(--text-secondary)] uppercase tracking-wider text-[10px]">{label}</span>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-[var(--text-secondary)] hover:text-white transition-colors text-[10px]"
          >
            {collapsed ? '▶ expand' : '▼ collapse'}
          </button>
        </div>
      )}
      {!label && isLong && (
        <div className="flex justify-end px-3 py-1.5 border-b" style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-default)' }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-[var(--text-secondary)] hover:text-white transition-colors text-[10px]"
          >
            {collapsed ? `▶ ${lines.length} lines` : '▼ collapse'}
          </button>
        </div>
      )}
      <pre
        className="p-3 overflow-x-auto text-[11px] leading-5 text-white"
        style={{ background: 'var(--bg-base)' }}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  )
}
