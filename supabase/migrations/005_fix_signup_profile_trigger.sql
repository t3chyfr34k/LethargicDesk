-- Usernames live in public.username_accounts in this project. Keep the auth
-- trigger's profile insert limited to columns that exist on public.profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  working_value boolean;
  joined_value date;
  joined_text text := nullif(btrim(new.raw_user_meta_data ->> 'joining_date'), '');
begin
  if requested_username = '' then
    requested_username := 'user_' || replace(left(new.id::text, 12), '-', '');
  end if;
  if requested_username !~ '^[a-z0-9][a-z0-9._-]{2,23}$' then
    raise exception 'Username must be 3-24 characters and use letters, numbers, dots, dashes, or underscores.';
  end if;

  if new.raw_user_meta_data ->> 'currently_working' = 'true' then
    working_value := true;
  elsif new.raw_user_meta_data ->> 'currently_working' = 'false' then
    working_value := false;
  end if;

  if joined_text ~ '^\d{4}-\d{2}-\d{2}$' then
    begin
      joined_value := joined_text::date;
    exception when others then
      joined_value := null;
    end;
  end if;

  insert into public.profiles (
    id, display_name, currently_working, company_name, joining_date, referral_source
  ) values (
    new.id,
    requested_username,
    working_value,
    case when working_value then nullif(btrim(new.raw_user_meta_data ->> 'company_name'), '') else null end,
    case when working_value then joined_value else null end,
    nullif(btrim(new.raw_user_meta_data ->> 'referral_source'), '')
  ) on conflict (id) do nothing;
  return new;
end;
$$;
