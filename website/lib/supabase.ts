import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

function createNoopClient(): SupabaseClient {
  const noopSub = { unsubscribe: () => {} }
  const noopResult = { data: null, error: { message: 'Supabase not configured' } }
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') return undefined // prevent Promise-like behavior
      if (prop === 'onAuthStateChange') {
        return () => ({ data: { subscription: noopSub } })
      }
      if (prop === 'getSession' || prop === 'setSession' || prop === 'signInWithOAuth' || prop === 'signOut') {
        return async () => noopResult
      }
      return new Proxy(() => noopResult, handler)
    },
    apply() {
      return new Proxy({ ...noopResult, ...noopSub }, handler)
    },
  }
  return new Proxy({}, handler) as unknown as SupabaseClient
}

export const supabase: SupabaseClient = supabaseUrl
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'implicit',
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : createNoopClient()
