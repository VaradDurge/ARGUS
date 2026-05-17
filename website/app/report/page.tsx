'use client'

import { useState } from 'react'

const TAGS = ['Request new feature', 'Bug', 'Failure'] as const
type Tag = typeof TAGS[number]

const TAG_COLORS: Record<Tag, { bg: string; border: string; text: string; activeBg: string; activeBorder: string; activeText: string }> = {
  'Request new feature': {
    bg: 'rgba(99,102,241,0.05)',
    border: 'rgba(99,102,241,0.2)',
    text: '#6366f1',
    activeBg: 'rgba(99,102,241,0.12)',
    activeBorder: '#6366f1',
    activeText: '#6366f1',
  },
  'Bug': {
    bg: 'rgba(239,68,68,0.05)',
    border: 'rgba(239,68,68,0.2)',
    text: '#ef4444',
    activeBg: 'rgba(239,68,68,0.12)',
    activeBorder: '#ef4444',
    activeText: '#ef4444',
  },
  'Failure': {
    bg: 'rgba(245,158,11,0.05)',
    border: 'rgba(245,158,11,0.2)',
    text: '#f59e0b',
    activeBg: 'rgba(245,158,11,0.12)',
    activeBorder: '#f59e0b',
    activeText: '#f59e0b',
  },
}

const WEBHOOK_URL =
  'https://discord.com/api/webhooks/1505632723539066980/aV5SfeCJ_m6rdxweGQkX0sJUT5mcI95wFU5DVvy1ELTaZQgV34MnhvzwJzsoDZLARNoS'

export default function ReportPage() {
  const [subject, setSubject] = useState('')
  const [tag, setTag] = useState<Tag | null>(null)
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !tag || !description.trim()) return

    setStatus('sending')

    const tagEmoji: Record<Tag, string> = {
      'Request new feature': '✨',
      'Bug': '🐛',
      'Failure': '🔥',
    }

    const payload = {
      embeds: [
        {
          title: `${tagEmoji[tag]} ${subject}`,
          description,
          color: tag === 'Request new feature' ? 0x6366f1 : tag === 'Bug' ? 0xef4444 : 0xf59e0b,
          fields: [
            { name: 'Tag', value: tag, inline: true },
          ],
          footer: { text: 'ARGUS — Report the Dev' },
          timestamp: new Date().toISOString(),
        },
      ],
    }

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok || res.status === 204) {
        setStatus('sent')
        setSubject('')
        setTag(null)
        setDescription('')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="max-w-xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
          Report the Dev
        </h1>
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          Found a bug, hit a failure, or want a new feature? Let me know.
        </p>
      </div>

      {status === 'sent' ? (
        <div
          className="rounded-xl p-6 text-center flex flex-col items-center gap-3"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.12)' }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 10l4 4 8-8" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-[15px] font-semibold" style={{ color: '#10b981' }}>Report sent!</p>
          <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            Thanks — I&apos;ll look into it.
          </p>
          <button
            onClick={() => setStatus('idle')}
            className="mt-2 text-[13px] font-medium px-4 py-1.5 rounded-lg transition-colors"
            style={{ color: '#6366f1', background: 'rgba(99,102,241,0.08)' }}
          >
            Send another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Subject */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Short summary of the issue or request"
              maxLength={120}
              className="w-full rounded-lg px-3.5 py-2.5 text-[13px] outline-none transition-colors"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
              required
            />
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Tag
            </label>
            <div className="flex gap-2 flex-wrap">
              {TAGS.map(t => {
                const active = tag === t
                const c = TAG_COLORS[t]
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTag(active ? null : t)}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all select-none"
                    style={{
                      background: active ? c.activeBg : c.bg,
                      border: `1px solid ${active ? c.activeBorder : c.border}`,
                      color: active ? c.activeText : c.text,
                      boxShadow: active ? `0 0 0 1px ${c.activeBorder}20` : 'none',
                    }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
            {!tag && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Select one tag</p>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe what happened, what you expected, or what you'd like to see..."
              rows={5}
              maxLength={2000}
              className="w-full rounded-lg px-3.5 py-2.5 text-[13px] outline-none resize-none transition-colors"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
              required
            />
            <p className="text-[11px] text-right" style={{ color: 'var(--text-muted)' }}>
              {description.length}/2000
            </p>
          </div>

          {/* Error */}
          {status === 'error' && (
            <p className="text-[12px]" style={{ color: '#ef4444' }}>
              Something went wrong. Try again.
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!subject.trim() || !tag || !description.trim() || status === 'sending'}
            className="self-start px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all"
            style={{
              background: '#6366f1',
              color: '#fff',
              opacity: (!subject.trim() || !tag || !description.trim() || status === 'sending') ? 0.5 : 1,
              cursor: (!subject.trim() || !tag || !description.trim() || status === 'sending') ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'sending' ? 'Sending…' : 'Send Report'}
          </button>
        </form>
      )}
    </div>
  )
}
