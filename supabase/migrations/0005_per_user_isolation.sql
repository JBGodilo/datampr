-- Scope every business table to its owning user. Before this migration the
-- three tables (data_source_credentials, object_validation_rules,
-- import_history) granted full CRUD to the `anon` role with `using (true)`,
-- meaning any signed-in user (or anonymous request with the publishable
-- key) could read or modify every row. After this migration:
--
--   1. Each row carries a user_id referencing auth.users.
--   2. RLS policies grant access only when auth.uid() = user_id.
--   3. The `authenticated` role is granted CRUD; `anon` is fully revoked.
--
-- Existing rows (created before this migration) are backfilled to the
-- project owner so they remain accessible to that user.

-- 1. Add user_id columns (nullable for now so backfill can run)
alter table public.data_source_credentials
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.object_validation_rules
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.import_history
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Backfill orphaned rows to the project owner
update public.data_source_credentials
  set user_id = 'c19e40ad-9105-4af0-b6e4-839455ff578b'
  where user_id is null;

update public.object_validation_rules
  set user_id = 'c19e40ad-9105-4af0-b6e4-839455ff578b'
  where user_id is null;

update public.import_history
  set user_id = 'c19e40ad-9105-4af0-b6e4-839455ff578b'
  where user_id is null;

-- 3. Lock the column: every future row must have an owner
alter table public.data_source_credentials alter column user_id set not null;
alter table public.object_validation_rules alter column user_id set not null;
alter table public.import_history          alter column user_id set not null;

-- 4. Indexes for the RLS filter
create index if not exists data_source_credentials_user_id_idx
  on public.data_source_credentials (user_id);
create index if not exists object_validation_rules_user_id_idx
  on public.object_validation_rules (user_id);
create index if not exists import_history_user_id_idx
  on public.import_history (user_id);

-- 5. Drop every pre-existing anon policy (they all granted unrestricted access)
drop policy if exists "anon read credentials"                on public.data_source_credentials;
drop policy if exists "anon insert credentials"              on public.data_source_credentials;
drop policy if exists "anon delete credentials"              on public.data_source_credentials;
drop policy if exists "anon can update data_source_credentials" on public.data_source_credentials;

drop policy if exists "anon read validation rules"           on public.object_validation_rules;
drop policy if exists "anon insert validation rules"         on public.object_validation_rules;
drop policy if exists "anon update validation rules"         on public.object_validation_rules;
drop policy if exists "anon delete validation rules"         on public.object_validation_rules;

drop policy if exists "anon read import history"             on public.import_history;
drop policy if exists "anon insert import history"           on public.import_history;

-- 6. Revoke the table grants from anon — RLS would block anyway, but
--    removing the grants closes a gap where someone could probe the table.
revoke all on public.data_source_credentials from anon;
revoke all on public.object_validation_rules from anon;
revoke all on public.import_history          from anon;

-- 7. Grant CRUD to the `authenticated` role and add per-user policies
grant select, insert, update, delete on public.data_source_credentials to authenticated;
grant select, insert, update, delete on public.object_validation_rules to authenticated;
grant select, insert, update, delete on public.import_history          to authenticated;

drop policy if exists "users manage own credentials" on public.data_source_credentials;
create policy "users manage own credentials"
  on public.data_source_credentials for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "users manage own validation rules" on public.object_validation_rules;
create policy "users manage own validation rules"
  on public.object_validation_rules for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "users manage own import history" on public.import_history;
create policy "users manage own import history"
  on public.import_history for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
