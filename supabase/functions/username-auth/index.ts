import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,23}$/
const accountEmail = (username: string) => `${username}@accounts.lethargicdesk.invalid`

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return json({ error: 'Username sign-up is not configured on the server.' }, 503)

  let body: { username?: unknown; password?: unknown }
  try { body = await request.json() } catch { return json({ error: 'Invalid request.' }, 400) }

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!usernamePattern.test(username)) return json({ error: 'Use 3–24 characters: letters, numbers, dot, underscore or hyphen. Start with a letter or number.' }, 400)
  if (password.length < 12 || password.length > 128) return json({ error: 'Password must be between 12 and 128 characters.' }, 400)

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: accountEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username },
  })
  if (createError || !created.user) {
    const duplicate = createError?.message.toLowerCase().includes('already')
    return json({ error: duplicate ? 'That username is already taken.' : 'Could not create the account. Please try again.' }, duplicate ? 409 : 400)
  }

  const { error: profileError } = await admin.from('username_accounts').insert({
    user_id: created.user.id,
    username,
    username_normalized: username,
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    const duplicate = profileError.code === '23505'
    return json({ error: duplicate ? 'That username is already taken.' : 'Could not save the username. Please try again.' }, duplicate ? 409 : 500)
  }

  return json({ ok: true })
})

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
