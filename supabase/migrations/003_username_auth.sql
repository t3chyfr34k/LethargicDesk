-- Usernames are public identifiers only. Password hashes remain managed by Supabase Auth.
create table if not exists public.username_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_normalized text not null unique,
  created_at timestamptz not null default now(),
  constraint username_accounts_format check (username_normalized ~ '^[a-z0-9][a-z0-9._-]{2,23}$')
);

alter table public.username_accounts enable row level security;
revoke all on public.username_accounts from anon, authenticated;

