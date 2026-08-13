-- Study-wide message templates stored on form_settings (no separate table).

alter table form_settings
  add column if not exists message_templates jsonb not null default '{}'::jsonb;

comment on column form_settings.message_templates is
  'JSON map of template_key -> { title, channel, enabled, template }. Study config lives on the registration row.';

notify pgrst, 'reload schema';
