-- Hybrid eligibility: admin can override automatic IP-based decisions.

alter table participants
  add column if not exists eligibility_manual_override boolean not null default false;

alter table participants
  add column if not exists eligibility_override_reason text;

alter table participants
  add column if not exists eligibility_overridden_at timestamptz;

comment on column participants.eligibility_manual_override is
  'When true, automatic IP eligibility recalculation will not change participant status.';
comment on column participants.eligibility_override_reason is
  'Admin-provided reason for manual eligibility override.';
comment on column participants.eligibility_overridden_at is
  'Timestamp when an admin last set eligibility manually.';

notify pgrst, 'reload schema';
