'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Listen for auth changes (handles OAuth callback tokens in hash)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setLoading(false)
    })

    // On localhost: try to auto-login from CLI credentials before falling back
    // to the normal getSession() check.
    const init = async () => {
      if (window.location.hostname === 'localhost') {
        try {
          const res = await fetch('/api/auth')
          if (res.ok) {
            const { access_token, refresh_token } = await res.json()
            if (access_token && refresh_token) {
              const { data } = await supabase.auth.setSession({ access_token, refresh_token })
              if (data.session) {
                // onAuthStateChange will fire and update state
                return
              }
            }
          }
        } catch {
          // local server may not expose /api/auth — fall through
        }
      }
      const { data: { session: s } } = await supabase.auth.getSession()
      setSession(s)
      setLoading(false)
    }

    init()

    return () => subscription.unsubscribe()
  }, [])

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
