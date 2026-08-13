-- Survey image metadata (public URLs for study-images Storage bucket).
-- Syncs every file from the bucket using its original name — no renaming/formatting.

create table if not exists public.survey_images (
  id uuid primary key default gen_random_uuid(),
  image_name text not null unique,
  image_url text not null,
  category text not null default 'misc',
  question_key text null,
  description text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Drop legacy naming checks so original bucket filenames are allowed
-- (e.g. "3-4th coverage.jpg" with spaces, digits, hyphens).
alter table public.survey_images
  drop constraint if exists survey_images_image_name_format;

alter table public.survey_images
  drop constraint if exists survey_images_image_name_not_generic;

create index if not exists survey_images_category_idx
  on public.survey_images (category);

create index if not exists survey_images_question_key_idx
  on public.survey_images (question_key);

create index if not exists survey_images_is_active_idx
  on public.survey_images (is_active);

create or replace function public.set_survey_images_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists survey_images_set_updated_at on public.survey_images;
create trigger survey_images_set_updated_at
  before update on public.survey_images
  for each row
  execute function public.set_survey_images_updated_at();

comment on table public.survey_images is
  'Metadata + public hyperlinks for survey images in the study-images Storage bucket.';

comment on column public.survey_images.image_name is
  'Original filename from Storage (basename, unchanged).';

comment on column public.survey_images.image_url is
  'Directly accessible public Storage URL (opens the image in a browser).';

-- Public base for study-images (no trailing slash).
-- Override by passing p_public_base when calling the function.
create or replace function public.sync_survey_images_from_storage(
  p_public_base text default null
)
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  synced_count integer := 0;
  default_base constant text :=
    'https://pwnijqtqcwldxuxlximl.supabase.co/storage/v1/object/public/study-images';
  base text := nullif(
    trim(trailing '/' from coalesce(nullif(trim(p_public_base), ''), default_base)),
    ''
  );
begin
  with storage_files as (
    select
      o.name as object_path,
      -- Original file name only (last path segment), no reformatting
      reverse(split_part(reverse(o.name), '/', 1)) as image_name,
      case
        when position('/' in o.name) > 0 then split_part(o.name, '/', 1)
        else 'misc'
      end as category
    from storage.objects o
    where o.bucket_id = 'study-images'
      and o.name is not null
      and o.name <> ''
      and right(o.name, 1) <> '/'
      and reverse(split_part(reverse(o.name), '/', 1))
        ~* '\.(png|jpe?g|webp|gif|svg|bmp|avif)$'
  ),
  upserted as (
    insert into public.survey_images (
      image_name,
      image_url,
      category,
      question_key,
      description,
      is_active
    )
    select
      sf.image_name,
      -- Always store a clickable public URL
      base || '/' || sf.object_path,
      sf.category,
      null,
      null,
      true
    from storage_files sf
    on conflict (image_name) do update set
      image_url = excluded.image_url,
      category = excluded.category,
      is_active = true,
      updated_at = now()
    returning 1
  )
  select count(*)::integer into synced_count from upserted;

  return synced_count;
end;
$$;

comment on function public.sync_survey_images_from_storage(text) is
  'Upserts survey_images from study-images Storage using original filenames and full public URLs.';

-- Sync with full public URLs (e.g. .../study-images/Balconette.jpg)
select public.sync_survey_images_from_storage(
  'https://pwnijqtqcwldxuxlximl.supabase.co/storage/v1/object/public/study-images'
);
