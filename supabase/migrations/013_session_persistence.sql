-- T-48h: Harden participant_sessions for 48-hour persistent login.

alter table participant_sessions
  add column if not exists last_seen_at timestamptz default now();

alter table participant_sessions
  add column if not exists revoked_at timestamptz;

alter table participant_sessions
  alter column created_at set default now();

-- Fast lookup by participant for session reuse / revocation.
create index if not exists idx_participant_sessions_lead_id
  on participant_sessions(lead_id);

-- Backfill last_seen_at for any historical rows.
update participant_sessions
set last_seen_at = coalesce(last_seen_at, created_at, now())
where last_seen_at is null;

notify pgrst, 'reload schema';
