-- Public Supabase Storage bucket for centralized survey images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'study-images',
  'study-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "study_images_public_read" on storage.objects;
create policy "study_images_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'study-images');
