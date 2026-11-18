-- Optional signup answers are stored on each user's own profile row.
alter table public.profiles
  add column if not exists currently_working boolean,
  add column if not exists company_name text,
  add column if not exists joining_date date,
  add column if not exists referral_source text;
