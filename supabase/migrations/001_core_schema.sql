-- Consolidated core schema (001–006) without survey_responses.
-- Phase 0 launch slice + lead_id identity for a fresh database.

create extension if not exists pgcrypto;

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),

  participant_code text unique,

  full_name text not null,
  mobile text unique not null,
  dob date not null,

  city text,
  status text default 'lead',

  referred_by uuid references participants(id),

  ip_address text,
  user_agent text,
  is_flagged_duplicate boolean default false,

  created_at timestamptz default now()
);

create index if not exists idx_participants_mobile on participants(mobile);
create unique index if not exists idx_participants_mobile_unique on participants(mobile);
create index if not exists idx_participants_status on participants(status);

-- Keep existing launch databases in sync when this script is re-run.
-- `create table if not exists` does not add columns to an existing table.
alter table participants add column if not exists participant_code text;
alter table participants add column if not exists status text default 'lead';
alter table participants add column if not exists referred_by uuid references participants(id);
alter table participants add column if not exists ip_address text;
alter table participants add column if not exists user_agent text;
alter table participants add column if not exists is_flagged_duplicate boolean default false;
alter table participants add column if not exists created_at timestamptz default now();

create unique index if not exists idx_participants_code on participants(participant_code);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),

  referrer_id uuid references participants(id),
  referred_id uuid references participants(id),

  reward_status text default 'pending',

  created_at timestamptz default now()
);

create index if not exists idx_referrals_referrer on referrals(referrer_id);
create index if not exists idx_referrals_referred on referrals(referred_id);

create table if not exists screener_responses (
  id uuid primary key default gen_random_uuid(),

  participant_id uuid references participants(id),
  mobile text unique,
  form_version integer not null,
  answers jsonb not null,
  csv_row jsonb,
  started_at timestamptz,
  submitted_at timestamptz default now(),
  ip_address text
);

create table if not exists participant_sessions (
  id uuid primary key default gen_random_uuid(),

  participant_id uuid references participants(id),
  token_hash text not null,
  remember_me boolean default false,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists idx_participant_sessions_token_hash
  on participant_sessions(token_hash);

create table if not exists form_versions (
  id uuid primary key default gen_random_uuid(),

  version integer not null,
  schema jsonb not null,
  published boolean default false,
  created_at timestamptz default now()
);

create unique index if not exists idx_form_versions_version on form_versions(version);

create table if not exists form_settings (
  id uuid primary key default gen_random_uuid(),
  active_version integer default 1
);

insert into form_settings (active_version)
select 1
where not exists (select 1 from form_settings);

insert into form_versions (version, schema, published)
select
  1,
  '{ "fields": [] }'::jsonb,
  true
where not exists (select 1 from form_versions where version = 1);

alter table participants enable row level security;
alter table referrals enable row level security;
alter table screener_responses enable row level security;
alter table participant_sessions enable row level security;
alter table form_versions enable row level security;
alter table form_settings enable row level security;

drop policy if exists "service_role_participants_all" on participants;
create policy "service_role_participants_all"
  on participants for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_referrals_all" on referrals;
create policy "service_role_referrals_all"
  on referrals for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_screener_responses_all" on screener_responses;
create policy "service_role_screener_responses_all"
  on screener_responses for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_participant_sessions_all" on participant_sessions;
create policy "service_role_participant_sessions_all"
  on participant_sessions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_form_versions_all" on form_versions;
create policy "service_role_form_versions_all"
  on form_versions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_form_settings_all" on form_settings;
create policy "service_role_form_settings_all"
  on form_settings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

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

-- Dynamic HTML form versions for admin-controlled registration

alter table form_versions add column if not exists name text;
alter table form_versions add column if not exists html_file_path text;

update form_versions
set
  name = coalesce(name, 'Innerwear Screener V1'),
  html_file_path = coalesce(html_file_path, '/forms/innerwear_screener_v1.html')
where version = 1;

insert into form_versions (version, name, html_file_path, schema, published)
select
  2,
  'Innerwear Screener V2',
  '/forms/innerwear_screener_v2.html',
  '{ "fields": [] }'::jsonb,
  true
where not exists (select 1 from form_versions where version = 2);

create or replace function generate_en_participant_code()
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
    code := 'EN' || suffix;

    if not exists (
      select 1 from participants where participant_code = code
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
  for participant_row in select id from participants order by created_at loop
    loop
      new_code := generate_en_participant_code();
      begin
        update participants
        set participant_code = new_code
        where id = participant_row.id;
        exit;
      exception
        when unique_violation then
          null;
      end;
    end loop;
  end loop;
end;
$$;

drop function generate_en_participant_code();

-- Store uploaded HTML forms directly in form_versions.

alter table form_versions add column if not exists html_content text;
alter table form_versions add column if not exists uploaded_file_name text;

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
-- 9. status_history (survey_responses omitted)
-- ---------------------------------------------------------------------------

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

alter table status_history enable row level security;

drop policy if exists "service_role_status_history_all" on status_history;
create policy "service_role_status_history_all"
  on status_history for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
