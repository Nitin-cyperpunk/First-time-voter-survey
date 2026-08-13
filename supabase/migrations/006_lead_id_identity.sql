-- T-09: Migrate internal identity from UUID to lead_id (CI_EN_0001)
-- Idempotent — safe to re-run on partially migrated databases.

-- ---------------------------------------------------------------------------
-- 1. Sequence + lead_id formatter + BEFORE INSERT trigger
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.participant_lead_id_seq') is not null
    and to_regclass('public.lead_seq_en') is null
  then
    alter sequence participant_lead_id_seq rename to lead_seq_en;
  end if;
end $$;

create sequence if not exists lead_seq_en start with 1;

create or replace function format_lead_id(seq_val bigint)
returns text
language sql
immutable
as $$
  select 'CI_EN_' || lpad(seq_val::text, 4, '0');
$$;

create or replace function assign_participant_lead_id()
returns trigger
language plpgsql
as $$
begin
  if new.lead_id is not null and new.lead_id <> '' then
    return new;
  end if;

  new.lead_id := format_lead_id(nextval('lead_seq_en'));
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Rename participant_code → referral_code (external referral identity)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'participants'
      and column_name = 'participant_code'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'participants'
      and column_name = 'referral_code'
  ) then
    alter table participants rename column participant_code to referral_code;
  end if;
end $$;

drop index if exists idx_participants_code;
create unique index if not exists idx_participants_referral_code
  on participants(referral_code)
  where referral_code is not null;

-- ---------------------------------------------------------------------------
-- 3. Add lead_id to participants, backfill, enforce uniqueness
-- ---------------------------------------------------------------------------

alter table participants add column if not exists lead_id text;

with numbered as (
  select id, row_number() over (order by created_at, id) as rn
  from participants
  where lead_id is null
)
update participants p
set lead_id = format_lead_id(n.rn)
from numbered n
where p.id = n.id;

select setval(
  'lead_seq_en',
  greatest(
    1,
    coalesce(
      (select max(substring(lead_id from 7)::int) from participants where lead_id ~ '^CI_EN_[0-9]+$'),
      0
    ) + 1
  ),
  false
);

alter table participants alter column lead_id set not null;
create unique index if not exists idx_participants_lead_id on participants(lead_id);

drop trigger if exists trg_assign_participant_lead_id on participants;
create trigger trg_assign_participant_lead_id
  before insert on participants
  for each row
  execute function assign_participant_lead_id();

-- ---------------------------------------------------------------------------
-- 4. participants.referred_by: UUID → lead_id (self-referencing FK)
-- ---------------------------------------------------------------------------

alter table participants add column if not exists referred_by_lead_id text;

update participants p
set referred_by_lead_id = ref.lead_id
from participants ref
where p.referred_by = ref.id
  and p.referred_by_lead_id is null;

alter table participants drop constraint if exists participants_referred_by_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'participants'
      and column_name = 'referred_by'
      and udt_name = 'uuid'
  ) then
    alter table participants drop column referred_by;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'participants'
      and column_name = 'referred_by_lead_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'participants'
      and column_name = 'referred_by'
  ) then
    alter table participants rename column referred_by_lead_id to referred_by;
  end if;
end $$;

alter table participants drop constraint if exists participants_referred_by_fkey;
alter table participants
  add constraint participants_referred_by_fkey
  foreign key (referred_by) references participants(lead_id)
  not valid;
alter table participants validate constraint participants_referred_by_fkey;

-- ---------------------------------------------------------------------------
-- 5. screener_responses: participant_id → lead_id
-- ---------------------------------------------------------------------------

alter table screener_responses add column if not exists lead_id text;

update screener_responses sr
set lead_id = p.lead_id
from participants p
where sr.participant_id = p.id
  and sr.lead_id is null;

update screener_responses sr
set lead_id = p.lead_id
from participants p
where sr.lead_id is null
  and sr.mobile is not null
  and sr.mobile = p.mobile;

alter table screener_responses drop constraint if exists screener_responses_participant_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'screener_responses'
      and column_name = 'participant_id'
  ) then
    alter table screener_responses drop column participant_id;
  end if;
end $$;

drop index if exists idx_screener_responses_mobile_unique;

alter table screener_responses drop constraint if exists screener_responses_lead_id_fkey;
alter table screener_responses
  add constraint screener_responses_lead_id_fkey
  foreign key (lead_id) references participants(lead_id)
  not valid;
alter table screener_responses validate constraint screener_responses_lead_id_fkey;

create unique index if not exists idx_screener_responses_lead_id_unique
  on screener_responses(lead_id)
  where lead_id is not null;

-- ---------------------------------------------------------------------------
-- 6. participant_sessions: participant_id → lead_id
-- ---------------------------------------------------------------------------

alter table participant_sessions add column if not exists lead_id text;

update participant_sessions ps
set lead_id = p.lead_id
from participants p
where ps.participant_id = p.id
  and ps.lead_id is null;

alter table participant_sessions drop constraint if exists participant_sessions_participant_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'participant_sessions'
      and column_name = 'participant_id'
  ) then
    alter table participant_sessions drop column participant_id;
  end if;
end $$;

alter table participant_sessions drop constraint if exists participant_sessions_lead_id_fkey;
alter table participant_sessions
  add constraint participant_sessions_lead_id_fkey
  foreign key (lead_id) references participants(lead_id)
  not valid;
alter table participant_sessions validate constraint participant_sessions_lead_id_fkey;

-- ---------------------------------------------------------------------------
-- 7. referrals: referrer_id/referred_id → referrer_lead_id/referred_lead_id
-- ---------------------------------------------------------------------------

alter table referrals add column if not exists referrer_lead_id text;
alter table referrals add column if not exists referred_lead_id text;
alter table referrals add column if not exists referral_code text;

update referrals r
set referrer_lead_id = p.lead_id
from participants p
where r.referrer_id = p.id
  and r.referrer_lead_id is null;

update referrals r
set referred_lead_id = p.lead_id
from participants p
where r.referred_id = p.id
  and r.referred_lead_id is null;

update referrals r
set referral_code = p.referral_code
from participants p
where r.referrer_id = p.id
  and r.referral_code is null;

alter table referrals drop constraint if exists referrals_referrer_id_fkey;
alter table referrals drop constraint if exists referrals_referred_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'referrals'
      and column_name = 'referrer_id'
  ) then
    alter table referrals drop column referrer_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'referrals'
      and column_name = 'referred_id'
  ) then
    alter table referrals drop column referred_id;
  end if;
end $$;

drop index if exists idx_referrals_referrer;
drop index if exists idx_referrals_referred;
create index if not exists idx_referrals_referrer_lead_id on referrals(referrer_lead_id);
create index if not exists idx_referrals_referred_lead_id on referrals(referred_lead_id);

alter table referrals drop constraint if exists referrals_referrer_lead_id_fkey;
alter table referrals
  add constraint referrals_referrer_lead_id_fkey
  foreign key (referrer_lead_id) references participants(lead_id)
  not valid;
alter table referrals validate constraint referrals_referrer_lead_id_fkey;

alter table referrals drop constraint if exists referrals_referred_lead_id_fkey;
alter table referrals
  add constraint referrals_referred_lead_id_fkey
  foreign key (referred_lead_id) references participants(lead_id)
  not valid;
alter table referrals validate constraint referrals_referred_lead_id_fkey;

-- ---------------------------------------------------------------------------
-- 8. payouts: participant_id → lead_id (if the live database has payouts)
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.payouts') is not null then
    alter table payouts add column if not exists lead_id text;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'payouts'
        and column_name = 'participant_id'
    ) then
      update payouts po
      set lead_id = p.lead_id
      from participants p
      where po.participant_id = p.id
        and po.lead_id is null;
    end if;

    alter table payouts drop constraint if exists payouts_participant_id_fkey;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'payouts'
        and column_name = 'participant_id'
    ) then
      alter table payouts drop column participant_id;
    end if;

    alter table payouts drop constraint if exists payouts_lead_id_fkey;
    alter table payouts
      add constraint payouts_lead_id_fkey
      foreign key (lead_id) references participants(lead_id)
      not valid;
    alter table payouts validate constraint payouts_lead_id_fkey;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Future tables: survey_responses, status_history
-- ---------------------------------------------------------------------------

create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz default now()
);

create unique index if not exists idx_survey_responses_lead_id_unique
  on survey_responses(lead_id);

alter table survey_responses drop constraint if exists survey_responses_lead_id_fkey;
alter table survey_responses
  add constraint survey_responses_lead_id_fkey
  foreign key (lead_id) references participants(lead_id)
  not valid;
alter table survey_responses validate constraint survey_responses_lead_id_fkey;

create table if not exists status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null,
  status text not null,
  changed_at timestamptz default now()
);

create index if not exists idx_status_history_lead_id on status_history(lead_id);

alter table status_history drop constraint if exists status_history_lead_id_fkey;
alter table status_history
  add constraint status_history_lead_id_fkey
  foreign key (lead_id) references participants(lead_id)
  not valid;
alter table status_history validate constraint status_history_lead_id_fkey;

-- ---------------------------------------------------------------------------
-- 10. Swap participants primary key: UUID id → lead_id
-- ---------------------------------------------------------------------------

do $$
declare
  remaining_dependencies text;
begin
  select string_agg(conrelid::regclass::text || '.' || conname, ', ')
  into remaining_dependencies
  from pg_constraint
  where contype = 'f'
    and confrelid = 'public.participants'::regclass
    and pg_get_constraintdef(oid) ilike '%REFERENCES participants(id)%';

  if remaining_dependencies is not null then
    raise exception
      'Cannot swap participants primary key. These foreign keys still reference participants(id): %',
      remaining_dependencies;
  end if;
end $$;

alter table participants drop constraint if exists participants_pkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'participants'
      and column_name = 'id'
  ) then
    alter table participants drop column id;
  end if;
end $$;

alter table participants add primary key (lead_id);

-- RLS for new tables
alter table survey_responses enable row level security;
alter table status_history enable row level security;

drop policy if exists "service_role_survey_responses_all" on survey_responses;
create policy "service_role_survey_responses_all"
  on survey_responses for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_status_history_all" on status_history;
create policy "service_role_status_history_all"
  on status_history for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
