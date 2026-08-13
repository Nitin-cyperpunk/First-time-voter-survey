-- Consolidated study config (036, 038–041). study-images / survey_images omitted.

-- Participant Instagram username for admin DM workflow (ig.me/m/{username}).

alter table participants
  add column if not exists instagram_id text;

comment on column participants.instagram_id is
  'Normalized Instagram username (no @) for opening ig.me/m/{username} from DM & Verify.';

create index if not exists idx_participants_instagram_id
  on participants (instagram_id)
  where instagram_id is not null;

-- Per-participant Instagram account visibility for admin Send routing.
-- public (default) = existing ig.me/m/{username} DM flow
-- private = open https://www.instagram.com/{handle} profile

alter table participants
  add column if not exists instagram_visibility text not null default 'public'
  check (instagram_visibility in ('public', 'private'));

comment on column participants.instagram_visibility is
  'Admin Send routing: public uses ig.me DM; private opens instagram.com/{handle} profile.';

-- Study-wide Enamor config on form_settings (registration row).
-- jsonb matches message_templates / call_dispositions pattern — one flexible object,
-- no new table.

alter table form_settings
  add column if not exists study_config jsonb not null default '{}'::jsonb;

comment on column form_settings.study_config is
  'Study-wide config (target, buffer, survey_active, open flags, age rule, terminations). Lives on form_type=registration.';

-- Seed empty object on existing rows (defaults applied in app merge).
update form_settings
set study_config = '{}'::jsonb
where study_config is null;

-- Opaque per-respondent refill links (mirrors survey_token pattern).
-- Token is unguessable; authorization is via /refill?t=... (no login).

alter table participants
  add column if not exists refill_token text;

create unique index if not exists participants_refill_token_unique_idx
  on participants (refill_token)
  where refill_token is not null and trim(refill_token) <> '';

-- Basic contact fields from registration screen 1 (not screener answers).
alter table participants
  add column if not exists email text,
  add column if not exists area text,
  add column if not exists pincode text;

notify pgrst, 'reload schema';
