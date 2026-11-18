import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL) as string | undefined
const anonKey = (
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string | undefined

export const supabase = url && anonKey ? createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string
    readonly VITE_SUPABASE_ANON_KEY?: string
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
    readonly NEXT_PUBLIC_SUPABASE_URL?: string
    readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string
  }
}
