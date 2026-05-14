-- One row per migration run. Successful and failed records are stored as JSONB
-- arrays on the same row so each import is a single atomic record.
-- Run this once in the Supabase SQL editor.

create table if not exists public.import_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  object_type text not null check (object_type in ('contacts', 'companies', 'deals', 'tickets')),
  source_label text,
  hubspot_connection_id text,
  hubspot_connection_label text,
  pipeline_label text,
  stage_label text,
  validation_rule_label text,
  total_rows integer not null default 0,
  ok_count integer not null default 0,
  error_count integer not null default 0,
  duration_ms integer not null default 0,
  fatal_error text,
  successful_records jsonb not null default '[]'::jsonb,
  failed_records jsonb not null default '[]'::jsonb
);

create index if not exists import_history_created_at_idx
  on public.import_history (created_at desc);

alter table public.import_history enable row level security;

-- App authenticates as `anon` via the publishable key (same pattern as
-- data_source_credentials / object_validation_rules). The pipeline endpoint
-- only inserts; the history page only selects. Tighten when auth is added.

drop policy if exists "anon read import history" on public.import_history;
create policy "anon read import history"
  on public.import_history for select
  to anon
  using (true);

drop policy if exists "anon insert import history" on public.import_history;
create policy "anon insert import history"
  on public.import_history for insert
  to anon
  with check (true);
