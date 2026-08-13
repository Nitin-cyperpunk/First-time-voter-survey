-- Consolidated study config. Instagram DM-verify + refill-token columns omitted
-- (single-form study — no access-granting layer).

-- Study-wide First-Time Voters config on form_settings (registration row).
-- jsonb matches message_templates pattern — one flexible object, no new table.

alter table form_settings
  add column if not exists study_config jsonb not null default '{}'::jsonb;

comment on column form_settings.study_config is
  'Study-wide config (target, buffer, form_status, capacity, age rule, terminations). Lives on form_type=registration.';

-- Seed empty object on existing rows (defaults applied in app merge).
update form_settings
set study_config = '{}'::jsonb
where study_config is null;

-- Basic contact fields from registration screen 1 (not screener answers).
alter table participants
  add column if not exists email text,
  add column if not exists area text,
  add column if not exists pincode text;

notify pgrst, 'reload schema';
