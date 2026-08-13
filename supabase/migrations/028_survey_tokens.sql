-- Secure survey access tokens (opaque, no lead_id embedded).

create table if not exists survey_tokens (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references participants(lead_id) on delete cascade,
  token text not null,
  form_version integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by text,
  is_active boolean not null default true
);

create unique index if not exists survey_tokens_token_unique_idx
  on survey_tokens (token);

create index if not exists survey_tokens_lead_id_idx
  on survey_tokens (lead_id);

create index if not exists survey_tokens_active_token_idx
  on survey_tokens (token)
  where is_active = true;

-- Backfill active tokens from participants for continuity.
insert into survey_tokens (lead_id, token, form_version, created_at, expires_at, is_active, created_by)
select
  p.lead_id,
  p.survey_token,
  null,
  coalesce(p.survey_token_created_at, now()),
  coalesce(p.survey_token_expires_at, now() + interval '30 days'),
  p.survey_access_granted,
  'migration'
from participants p
where p.survey_token is not null
  and trim(p.survey_token) <> '';

notify pgrst, 'reload schema';
