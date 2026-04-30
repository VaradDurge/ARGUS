'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.replace('/')
    }
  }, [loading, user, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Loading...
        </span>
      </div>
    )
  }

  if (user) return null

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div
        className="flex flex-col items-center gap-8 p-10 rounded-xl"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          minWidth: '360px',
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <svg
            width="36"
            height="36"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9 1.5L16.5 5.5V12.5L9 16.5L1.5 12.5V5.5L9 1.5Z"
              stroke="#3b82f6"
              strokeWidth="1.2"
              fill="none"
            />
            <circle
              cx="9"
              cy="9"
              r="2.2"
              fill="#3b82f6"
              fillOpacity="0.3"
              stroke="#3b82f6"
              strokeWidth="1.1"
            />
            <circle cx="9" cy="9" r="0.9" fill="#3b82f6" />
          </svg>
          <h1
            className="text-lg font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            ARGUS
          </h1>
          <p
            className="text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            Sign in to view your pipeline runs
          </p>
        </div>

        {/* Google Sign In */}
        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-3 px-5 py-3 rounded-lg text-sm font-medium transition-all hover:brightness-110 active:scale-[0.98] w-full justify-center"
          style={{
            background: '#ffffff',
            color: '#1f1f1f',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </button>

        <p
          className="text-[10px] text-center max-w-[260px]"
          style={{ color: 'var(--text-faint)' }}
        >
          Your runs are synced from the CLI via{' '}
          <span className="font-mono">argus login</span>
        </p>
      </div>
    </div>
  )
}
