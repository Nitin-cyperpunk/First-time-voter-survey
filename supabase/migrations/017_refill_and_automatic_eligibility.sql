-- Registration refill workflow + support for paid lifecycle status.

alter table participants
  add column if not exists refill_required boolean not null default false;

alter table participants
  add column if not exists refill_reason text;

alter table participants
  add column if not exists refill_requested_at timestamptz;

alter table participants
  add column if not exists refill_completed_at timestamptz;

comment on column participants.refill_required is
  'When true, participant must resubmit registration before accessing dashboard features.';
comment on column participants.refill_reason is
  'Admin-provided reason shown to the participant for the refill request.';
comment on column participants.refill_requested_at is
  'Timestamp when an admin requested registration refill.';
comment on column participants.refill_completed_at is
  'Timestamp when the participant completed the refill submission.';

notify pgrst, 'reload schema';
