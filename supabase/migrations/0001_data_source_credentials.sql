-- Stores reusable credentials per data source (e.g., Airtable PAT + base + table).
-- Run this once in the Supabase SQL editor.

create table if not exists public.data_source_credentials (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  label text not null,
  config jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists data_source_credentials_source_idx
  on public.data_source_credentials (source);

alter table public.data_source_credentials enable row level security;

-- The app only has the publishable key, which authenticates as `anon`.
-- These policies grant anon full CRUD on this table only.
-- Restrict further if you later add auth.

drop policy if exists "anon read credentials" on public.data_source_credentials;
create policy "anon read credentials"
  on public.data_source_credentials for select
  to anon
  using (true);

drop policy if exists "anon insert credentials" on public.data_source_credentials;
create policy "anon insert credentials"
  on public.data_source_credentials for insert
  to anon
  with check (true);

drop policy if exists "anon delete credentials" on public.data_source_credentials;
create policy "anon delete credentials"
  on public.data_source_credentials for delete
  to anon
  using (true);
