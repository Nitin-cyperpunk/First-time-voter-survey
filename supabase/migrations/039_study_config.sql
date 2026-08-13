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

notify pgrst, 'reload schema';
