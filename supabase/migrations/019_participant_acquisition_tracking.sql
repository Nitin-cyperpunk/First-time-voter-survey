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

notify pgrst, 'reload schema';
