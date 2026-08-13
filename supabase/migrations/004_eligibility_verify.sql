-- Acquisition + UPI/reward amounts + message templates.
-- Verification, refill, eligibility-override, and survey-token columns omitted
-- (single-form study — no access-granting layer).

-- Participant acquisition tracking: how a participant first heard about the
-- study, whether they arrived directly or via a referral, and which platform
-- generated a referral registration.

alter table participants
  add column if not exists acquisition_source text;

alter table participants
  add column if not exists acquisition_type text;

alter table participants
  add column if not exists referral_platform text;

alter table participants
  add column if not exists other_source text;

comment on column participants.acquisition_source is
  'How the participant first heard about the study (e.g. Instagram, WhatsApp, Friend, Other).';
comment on column participants.acquisition_type is
  'How the participant arrived: "direct" (no referral) or "referral".';
comment on column participants.referral_platform is
  'Platform that generated a referral registration (whatsapp/instagram/copy), set only for referral acquisitions.';
comment on column participants.other_source is
  'Free-text acquisition source captured when acquisition_source is "Other".';

create index if not exists participants_acquisition_source_idx
  on participants (acquisition_source);
create index if not exists participants_acquisition_type_idx
  on participants (acquisition_type);
create index if not exists participants_referral_platform_idx
  on participants (referral_platform);

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

-- Study-wide message templates stored on form_settings (no separate table).

alter table form_settings
  add column if not exists message_templates jsonb not null default '{}'::jsonb;

comment on column form_settings.message_templates is
  'JSON map of template_key -> { title, channel, enabled, template }. Study config lives on the registration row.';

-- Single-form lifecycle (terminated | completed | QC | paid).
alter table participants drop constraint if exists participants_status_check;
alter table participants
  add constraint participants_status_check
  check (
    status in (
      'terminated',
      'completed',
      'review_pass',
      'review_fail',
      'successful',
      'unsuccessful',
      'paid'
    )
  );

notify pgrst, 'reload schema';
