insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'maintenance-photos',
  'maintenance-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "maintenance photos admin read" on storage.objects;
drop policy if exists "maintenance photos owner read" on storage.objects;
drop policy if exists "maintenance photos owner insert" on storage.objects;
drop policy if exists "maintenance photos owner update" on storage.objects;

create policy "maintenance photos admin read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'maintenance-photos'
  and app_private.is_admin()
);

create policy "maintenance photos owner read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'maintenance-photos'
  and owner = auth.uid()
);

create policy "maintenance photos owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'maintenance-photos'
  and owner = auth.uid()
);

create policy "maintenance photos owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'maintenance-photos'
  and owner = auth.uid()
)
with check (
  bucket_id = 'maintenance-photos'
  and owner = auth.uid()
);

