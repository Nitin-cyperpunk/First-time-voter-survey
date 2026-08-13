-- Opaque per-respondent refill links (mirrors survey_token pattern).
-- Token is unguessable; authorization is via /refill?t=... (no login).

alter table participants
  add column if not exists refill_token text;

create unique index if not exists participants_refill_token_unique_idx
  on participants (refill_token)
  where refill_token is not null and trim(refill_token) <> '';

notify pgrst, 'reload schema';
