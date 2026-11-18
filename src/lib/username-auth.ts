export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,23}$/.test(normalizeUsername(username))
}

// This address is an internal Supabase Auth identifier; no email is sent or collected.
export function usernameAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@accounts.lethargicdesk.invalid`
}
