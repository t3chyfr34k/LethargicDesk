-- Lethargic Desk v0.1.0
-- Run this entire file in Supabase Dashboard > SQL Editor.
-- All user-owned tables enforce per-user isolation using Row Level Security.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  due_date date,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  description text,
  status text not null default 'active' check (status in ('active','on_hold','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  description text,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata',
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS on every exposed user-data table.
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.projects enable row level security;
alter table public.notes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.calendar_events enable row level security;
alter table public.time_entries enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.user_preferences enable row level security;

-- Profiles: a user can read and update only their own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
using ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Create isolated CRUD policies for all user-owned tables.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['tasks','projects','notes','bookmarks','calendar_events','time_entries','knowledge_items'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_select_own', tbl);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', tbl || '_select_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_insert_own', tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', tbl || '_insert_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_update_own', tbl);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', tbl || '_update_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_delete_own', tbl);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', tbl || '_delete_own', tbl);
    execute format('create index if not exists %I on public.%I (user_id)', tbl || '_user_id_idx', tbl);
  end loop;
end $$;

drop policy if exists "preferences_select_own" on public.user_preferences;
create policy "preferences_select_own" on public.user_preferences for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists "preferences_insert_own" on public.user_preferences;
create policy "preferences_insert_own" on public.user_preferences for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists "preferences_update_own" on public.user_preferences;
create policy "preferences_update_own" on public.user_preferences for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists tasks_user_due_idx on public.tasks(user_id, due_date);
create index if not exists tasks_user_completed_idx on public.tasks(user_id, completed);
create index if not exists projects_user_status_idx on public.projects(user_id, status);

-- Storage bucket for user-owned files. Object path must start with auth.uid().
insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-files', 'workspace-files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "workspace_files_select_own" on storage.objects;
create policy "workspace_files_select_own" on storage.objects for select to authenticated
using (bucket_id = 'workspace-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "workspace_files_insert_own" on storage.objects;
create policy "workspace_files_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'workspace-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "workspace_files_update_own" on storage.objects;
create policy "workspace_files_update_own" on storage.objects for update to authenticated
using (bucket_id = 'workspace-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'workspace-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "workspace_files_delete_own" on storage.objects;
create policy "workspace_files_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'workspace-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
