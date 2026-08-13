-- Editable call disposition options (form_settings) and per-participant outcomes.

alter table form_settings
  add column if not exists call_dispositions jsonb not null default '[]'::jsonb;

alter table participants
  add column if not exists call_disposition text;

alter table participants
  add column if not exists call_disposition_notes text;

alter table participants
  add column if not exists call_disposition_at timestamptz;

comment on column form_settings.call_dispositions is
  'Array of { key, label, enabled } call outcome options for DM & Verify agents.';

comment on column participants.call_disposition is
  'Agent-selected call disposition key from form_settings.call_dispositions.';

comment on column participants.call_disposition_notes is
  'Optional free-text notes recorded with the call disposition.';

notify pgrst, 'reload schema';
