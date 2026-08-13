-- UPI submission tracking + per-referral reward amounts for earnings aggregates.

alter table participants
  add column if not exists upi_submitted_at timestamptz;

alter table referrals
  add column if not exists reward_amount numeric(10, 2);

comment on column participants.upi_submitted_at is
  'When the participant submitted their UPI ID for referral payout.';
comment on column referrals.reward_amount is
  'Referral reward amount in INR when status becomes earned.';

-- Backfill earned referrals with the standard reward amount.
update referrals
set reward_amount = 50
where reward_status in ('earned', 'paid')
  and reward_amount is null;

notify pgrst, 'reload schema';
