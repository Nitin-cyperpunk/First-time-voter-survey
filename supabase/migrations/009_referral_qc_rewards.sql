-- T-10: Referral rewards become earned only after QC PASS.

alter table referrals add column if not exists earned_at timestamptz;
alter table referrals add column if not exists paid_at timestamptz;

update referrals
set reward_status = 'pending'
where reward_status is null;

alter table referrals alter column reward_status set default 'pending';
alter table referrals alter column reward_status set not null;

alter table referrals drop constraint if exists referrals_reward_status_check;
alter table referrals
  add constraint referrals_reward_status_check
  check (reward_status in ('pending', 'earned', 'paid'));

create unique index if not exists idx_referrals_referred_lead_id_unique
  on referrals(referred_lead_id)
  where referred_lead_id is not null;

create index if not exists idx_referrals_reward_status
  on referrals(reward_status);

notify pgrst, 'reload schema';
