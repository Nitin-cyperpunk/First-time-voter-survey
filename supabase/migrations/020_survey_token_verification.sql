-- Secure per-participant survey access after Instagram / Calleezer verification.

alter table participants
  add column if not exists survey_token text;

alter table participants
  add column if not exists survey_access_granted boolean not null default false;

alter table participants
  add column if not exists survey_token_created_at timestamptz;

alter table participants
  add column if not exists survey_token_expires_at timestamptz;

alter table participants
  add column if not exists verified_at timestamptz;

alter table participants
  add column if not exists verification_method text;

comment on column participants.survey_token is
  'Unique personal token for /survey?t= access. Never expose lead_id in survey URLs.';
comment on column participants.survey_access_granted is
  'True after admin grants survey access following verification.';
comment on column participants.survey_token_created_at is
  'When the current survey token was issued.';
comment on column participants.survey_token_expires_at is
  'When the current survey token expires.';
comment on column participants.verified_at is
  'When the participant was verified for survey access.';
comment on column participants.verification_method is
  'How verification was completed (e.g. instagram_dm, calleezer).';

create unique index if not exists participants_survey_token_unique_idx
  on participants (survey_token)
  where survey_token is not null;

notify pgrst, 'reload schema';
