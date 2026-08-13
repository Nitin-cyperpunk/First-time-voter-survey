-- Patch existing Phase 0 databases that were created before the final launch schema.

alter table participants add column if not exists participant_code text;
alter table participants add column if not exists status text default 'lead';
alter table participants add column if not exists referred_by uuid references participants(id);
alter table participants add column if not exists ip_address text;
alter table participants add column if not exists user_agent text;
alter table participants add column if not exists is_flagged_duplicate boolean default false;
alter table participants add column if not exists created_at timestamptz default now();

create unique index if not exists idx_participants_code on participants(participant_code);
create unique index if not exists idx_participants_mobile_unique on participants(mobile);
create index if not exists idx_participants_status on participants(status);

alter table screener_responses add column if not exists participant_id uuid references participants(id);
alter table screener_responses add column if not exists mobile text;
alter table screener_responses add column if not exists form_version integer;
alter table screener_responses add column if not exists answers jsonb default '{}'::jsonb;
alter table screener_responses add column if not exists csv_row jsonb;
alter table screener_responses add column if not exists started_at timestamptz;
alter table screener_responses add column if not exists submitted_at timestamptz default now();
alter table screener_responses add column if not exists ip_address text;

create unique index if not exists idx_screener_responses_mobile_unique
  on screener_responses(mobile)
  where mobile is not null;

alter table referrals add column if not exists referrer_id uuid references participants(id);
alter table referrals add column if not exists referred_id uuid references participants(id);
alter table referrals add column if not exists reward_status text default 'pending';
alter table referrals add column if not exists created_at timestamptz default now();

create index if not exists idx_referrals_referrer on referrals(referrer_id);
create index if not exists idx_referrals_referred on referrals(referred_id);

do $$
declare
  legacy_column text;
begin
  foreach legacy_column in array array[
    'panel_id',
    'lead_id',
    'respondent_id',
    'source',
    'category',
    'referral_status',
    'cool_off_until',
    'last_activity_at'
  ]
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'participants'
        and column_name = legacy_column
        and is_nullable = 'NO'
    ) then
      execute format(
        'alter table public.participants alter column %I drop not null',
        legacy_column
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

