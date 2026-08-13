-- Phase 0 Launch Slice schema

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
