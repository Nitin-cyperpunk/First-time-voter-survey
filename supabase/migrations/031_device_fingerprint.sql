-- Device fingerprint capture for anti-fraud analytics (no blocking in this migration).

alter table participants
  add column if not exists device_fingerprint text;

create index if not exists idx_participants_device_fingerprint
  on participants (device_fingerprint);

create table if not exists fingerprint_events (
  id uuid primary key default gen_random_uuid(),
  participant_lead_id text not null references participants(lead_id) on delete cascade,
  device_fingerprint text,
  ip_address text,
  user_agent text,
  event_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists fingerprint_events_device_fingerprint_idx
  on fingerprint_events (device_fingerprint);

create index if not exists fingerprint_events_participant_lead_id_idx
  on fingerprint_events (participant_lead_id);

create index if not exists fingerprint_events_created_at_idx
  on fingerprint_events (created_at desc);

notify pgrst, 'reload schema';
