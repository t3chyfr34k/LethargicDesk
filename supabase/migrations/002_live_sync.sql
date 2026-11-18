-- Account-scoped live sync. Every record is isolated by authenticated user and workspace.
create table if not exists public.workspace_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null,
  collection text not null,
  record_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (user_id, workspace_id, collection, record_id)
);

alter table public.workspace_records enable row level security;
drop policy if exists workspace_records_select_own on public.workspace_records;
create policy workspace_records_select_own on public.workspace_records for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists workspace_records_insert_own on public.workspace_records;
create policy workspace_records_insert_own on public.workspace_records for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists workspace_records_update_own on public.workspace_records;
create policy workspace_records_update_own on public.workspace_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists workspace_records_delete_own on public.workspace_records;
create policy workspace_records_delete_own on public.workspace_records for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists workspace_records_lookup_idx on public.workspace_records(user_id, workspace_id);
do $$ begin
  alter publication supabase_realtime add table public.workspace_records;
exception when duplicate_object then null;
end $$;
