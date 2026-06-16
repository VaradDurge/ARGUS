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
    <div className="overflow-hidden rounded-[8px] border border-border bg-code text-xs">
      {label && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-code-header">
          <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="font-mono text-[11px] text-text-tertiary hover:text-foreground transition-colors"
          >
            {collapsed ? '▶ expand' : '▼ collapse'}
          </button>
        </div>
      )}
      {!label && isLong && (
        <div className="flex justify-end px-3 py-1.5 border-b border-border bg-code-header">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="font-mono text-[11px] text-text-tertiary hover:text-foreground transition-colors"
          >
            {collapsed ? `▶ ${lines.length} lines` : '▼ collapse'}
          </button>
        </div>
      )}
      <pre
        className="scrollbar-thin overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-foreground"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  )
}
