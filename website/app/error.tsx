'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div
        className="rounded-xl px-6 py-5 space-y-3 max-w-lg w-full"
        style={{
          background: 'rgba(239,68,68,0.04)',
          border: '1px solid rgba(239,68,68,0.2)',
        }}
      >
        <p className="text-xs font-medium text-red-400">Something went wrong</p>
        <p className="text-xs font-mono" style={{ color: '#71717a' }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={reset}
          className="text-xs px-3 py-1.5 rounded-md transition-colors"
          style={{
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
