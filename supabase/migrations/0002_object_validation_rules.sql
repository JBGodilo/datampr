-- Per-object validation rule profiles. A profile belongs to exactly one HubSpot
-- object type (contacts | companies | deals | tickets) so rules never leak
-- across objects. Run this once in the Supabase SQL editor.

create table if not exists public.object_validation_rules (
  id uuid primary key default gen_random_uuid(),
  object_type text not null check (object_type in ('contacts', 'companies', 'deals', 'tickets')),
  label text not null,
  rules jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists object_validation_rules_object_type_idx
  on public.object_validation_rules (object_type);

alter table public.object_validation_rules enable row level security;

-- App authenticates as `anon` via the publishable key (same pattern as
-- data_source_credentials). Tighten when auth is added.

drop policy if exists "anon read validation rules" on public.object_validation_rules;
create policy "anon read validation rules"
  on public.object_validation_rules for select
  to anon
  using (true);

drop policy if exists "anon insert validation rules" on public.object_validation_rules;
create policy "anon insert validation rules"
  on public.object_validation_rules for insert
  to anon
  with check (true);

drop policy if exists "anon update validation rules" on public.object_validation_rules;
create policy "anon update validation rules"
  on public.object_validation_rules for update
  to anon
  using (true)
  with check (true);

drop policy if exists "anon delete validation rules" on public.object_validation_rules;
create policy "anon delete validation rules"
  on public.object_validation_rules for delete
  to anon
  using (true);
