-- Consolidated identity + referrals (007–010).

-- Remove legacy panel_id column from older database schemas.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'participants'
      and column_name = 'panel_id'
  ) then
    alter table participants drop column panel_id;
  end if;
end $$;

-- T-15: Enforce referral_code NOT NULL and full UNIQUE constraint.

create or replace function generate_ftv_referral_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text;
  suffix text;
  i int;
begin
  loop
    suffix := '';
    for i in 1..6 loop
      suffix := suffix || substr(
        alphabet,
        1 + floor(random() * length(alphabet))::int,
        1
      );
    end loop;
    code := 'FTV' || suffix;

    if not exists (
      select 1 from participants where referral_code = code
    ) then
      return code;
    end if;
  end loop;
end;
$$;

do $$
declare
  participant_row record;
  new_code text;
begin
  for participant_row in
    select lead_id from participants where referral_code is null
  loop
    loop
      new_code := generate_ftv_referral_code();
      begin
        update participants
        set referral_code = new_code
        where lead_id = participant_row.lead_id;
        exit;
      exception
        when unique_violation then
          null;
      end;
    end loop;
  end loop;
end $$;

drop function generate_ftv_referral_code();

drop index if exists idx_participants_referral_code;
create unique index if not exists idx_participants_referral_code
  on participants(referral_code);

alter table participants alter column referral_code set not null;

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

-- T-12: Admin views — payouts, status_history audit fields, participant UPI

-- ---------------------------------------------------------------------------
-- status_history audit trail
-- ---------------------------------------------------------------------------
alter table status_history add column if not exists old_status text;
alter table status_history add column if not exists new_status text;
alter table status_history add column if not exists changed_by text default 'system';
alter table status_history add column if not exists notes text;

-- Backfill new_status from legacy status column when present
update status_history
set new_status = status
where new_status is null and status is not null;

-- ---------------------------------------------------------------------------
-- participants.upi_id (captured on survey / dashboard)
-- ---------------------------------------------------------------------------
alter table participants add column if not exists upi_id text;

-- ---------------------------------------------------------------------------
-- payouts — payment tracking per participant (earnings computed at read time)
-- ---------------------------------------------------------------------------
create table if not exists payouts (
  lead_id text primary key references participants(lead_id) on delete cascade,
  payment_status text not null default 'pending',
  payment_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Normalize existing payouts table if it was created with a different shape
alter table payouts add column if not exists payment_status text default 'pending';
alter table payouts add column if not exists payment_date timestamptz;
alter table payouts add column if not exists created_at timestamptz default now();
alter table payouts add column if not exists updated_at timestamptz default now();

alter table payouts drop constraint if exists payouts_payment_status_check;
alter table payouts
  add constraint payouts_payment_status_check
  check (payment_status in ('pending', 'ready', 'paid'));

update payouts set payment_status = 'pending' where payment_status is null;

alter table payouts enable row level security;

drop policy if exists "service_role_payouts_all" on payouts;
create policy "service_role_payouts_all"
  on payouts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
