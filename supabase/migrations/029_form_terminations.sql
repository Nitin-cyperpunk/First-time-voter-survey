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

notify pgrst, 'reload schema';
