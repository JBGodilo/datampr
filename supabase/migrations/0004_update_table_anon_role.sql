-- Grant UPDATE on the table to the anon role
grant update on public.data_source_credentials to anon;

-- Allow anon to update any row (matches your existing INSERT/DELETE policies)
create policy "anon can update data_source_credentials"
on public.data_source_credentials
for update
to anon
using (true)
with check (true);
