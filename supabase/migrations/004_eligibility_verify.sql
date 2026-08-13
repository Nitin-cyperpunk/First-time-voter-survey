-- Consolidated eligibility + verification (017–023).
-- 020 contributes verified_at + verification_method only (no survey_token columns).

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

-- Instagram / Calleezer verification (survey token columns omitted).

alter table participants
  add column if not exists verified_at timestamptz;

alter table participants
  add column if not exists verification_method text;

comment on column participants.verified_at is
  'When the participant was verified for survey access.';
comment on column participants.verification_method is
  'How verification was completed (e.g. instagram_dm, calleezer).';

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

-- Allow the under_review status used during the post-registration eligibility journey.
-- New participants are inserted as under_review before an eligibility decision is made.

alter table participants drop constraint if exists participants_status_check;
alter table participants
  add constraint participants_status_check
  check (
    status in (
      'lead',
      'under_review',
      'eligible',
      'not_eligible',
      'completed',
      'review_pass',
      'review_fail',
      'successful',
      'unsuccessful'
    )
  );

notify pgrst, 'reload schema';
