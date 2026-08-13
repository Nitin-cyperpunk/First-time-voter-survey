-- Consolidated ops + terminations. DM/verify, call dispositions, and survey
-- tokens omitted (single-form study).

-- Sarla-format normalized export map (flat question columns for CSV/Excel).

alter table screener_responses
  add column if not exists normalized_export jsonb;

comment on column screener_responses.normalized_export is
  'Flat export map keyed by Qn.Label or Qn.Prefix-Option (Sarla export format).';

-- Relational message templates (study-wide). Replaces JSONB as source of truth.

create table if not exists message_templates (
  id text primary key,
  name text not null,
  channel text not null check (channel in ('whatsapp', 'instagram')),
  body text not null default '',
  variables text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists message_templates_channel_active_idx
  on message_templates (channel)
  where is_active = true;

-- Seed from form_settings JSONB when present.
insert into message_templates (id, name, channel, body, variables, is_active, created_at, updated_at)
select
  key as id,
  coalesce(nullif(trim(value->>'title'), ''), key) as name,
  coalesce(value->>'channel', 'whatsapp') as channel,
  coalesce(value->>'template', '') as body,
  '{}'::text[] as variables,
  coalesce((value->>'enabled')::boolean, true) as is_active,
  now(),
  now()
from form_settings fs,
  lateral jsonb_each(fs.message_templates) as t(key, value)
where fs.form_type = 'registration'
  and jsonb_typeof(fs.message_templates) = 'object'
on conflict (id) do nothing;

-- Persisted form termination events for admin review.

create table if not exists form_terminations (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references participants(lead_id) on delete cascade,
  form_type text not null,
  form_version integer,
  rule_key text not null,
  rule_label text,
  question_key text,
  question_label text,
  answer_value text,
  reason_text text,
  participant_status text,
  submitted_at timestamptz not null default now()
);

create index if not exists form_terminations_lead_id_idx
  on form_terminations (lead_id);

create index if not exists form_terminations_form_type_idx
  on form_terminations (form_type);

create index if not exists form_terminations_rule_key_idx
  on form_terminations (rule_key);

create index if not exists form_terminations_submitted_at_idx
  on form_terminations (submitted_at desc);

-- Track whether each screener submission completed or was terminated, and why.

alter table screener_responses
  add column if not exists completion_status text,
  add column if not exists termination_reason text;

alter table screener_responses
  drop constraint if exists screener_responses_completion_status_check;

alter table screener_responses
  add constraint screener_responses_completion_status_check
  check (
    completion_status is null
    or completion_status in ('Completed', 'Terminated')
  );

comment on column screener_responses.completion_status is
  'Completed when the form finished successfully; Terminated when Q1/Q2 (or other rules) ended early. NULL for legacy rows.';
comment on column screener_responses.termination_reason is
  'Business reason when completion_status is Terminated (e.g. Q1 not first-time voter).';

notify pgrst, 'reload schema';
