-- Consolidated fingerprint + admin RBAC (031–034).

-- Device fingerprint capture for anti-fraud analytics (no blocking in this migration).

alter table participants
  add column if not exists device_fingerprint text;

create index if not exists idx_participants_device_fingerprint
  on participants (device_fingerprint);

create table if not exists fingerprint_events (
  id uuid primary key default gen_random_uuid(),
  participant_lead_id text not null references participants(lead_id) on delete cascade,
  device_fingerprint text,
  ip_address text,
  user_agent text,
  event_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists fingerprint_events_device_fingerprint_idx
  on fingerprint_events (device_fingerprint);

create index if not exists fingerprint_events_participant_lead_id_idx
  on fingerprint_events (participant_lead_id);

create index if not exists fingerprint_events_created_at_idx
  on fingerprint_events (created_at desc);

-- Flag-only duplicate device fingerprint detection (no blocking).

alter table participants
  add column if not exists duplicate_flag boolean not null default false,
  add column if not exists duplicate_reason text,
  add column if not exists duplicate_detected_at timestamptz,
  add column if not exists review_status text not null default 'Pending',
  add column if not exists original_participant_lead_id text;

alter table participants
  drop constraint if exists participants_review_status_check;

alter table participants
  add constraint participants_review_status_check
  check (review_status in ('Pending', 'Approved', 'Rejected'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'participants_original_participant_lead_id_fkey'
  ) then
    alter table participants
      add constraint participants_original_participant_lead_id_fkey
      foreign key (original_participant_lead_id)
      references participants (lead_id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_participants_duplicate_flag
  on participants (duplicate_flag);

create index if not exists idx_participants_review_status
  on participants (review_status);

create index if not exists idx_participants_device_fingerprint
  on participants (device_fingerprint);

alter table fingerprint_events
  add column if not exists original_participant_lead_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fingerprint_events_original_participant_lead_id_fkey'
  ) then
    alter table fingerprint_events
      add constraint fingerprint_events_original_participant_lead_id_fkey
      foreign key (original_participant_lead_id)
      references participants (lead_id)
      on delete set null;
  end if;
end $$;

comment on column participants.duplicate_flag is
  'True when this registration reused a device fingerprint seen on another participant.';
comment on column participants.duplicate_reason is
  'Human-readable reason when duplicate_flag is true.';
comment on column participants.review_status is
  'Admin review state for fingerprint duplicate flags: Pending, Approved, or Rejected.';

-- Standalone referral leads (not survey participants; no participant lead_id).

create table if not exists referral_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  mobile text not null,
  city text not null,
  area text,
  pincode text,
  dob date not null,
  referral_code text not null,
  referred_by text,
  share_count integer not null default 0,
  whatsapp_shared_at timestamptz,
  instagram_shared_at timestamptz,
  status text not null default 'Lead',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table referral_leads add column if not exists full_name text;
alter table referral_leads add column if not exists mobile text;
alter table referral_leads add column if not exists city text;
alter table referral_leads add column if not exists area text;
alter table referral_leads add column if not exists pincode text;
alter table referral_leads add column if not exists dob date;
alter table referral_leads add column if not exists referral_code text;
alter table referral_leads add column if not exists referred_by text;
alter table referral_leads add column if not exists share_count integer not null default 0;
alter table referral_leads add column if not exists whatsapp_shared_at timestamptz;
alter table referral_leads add column if not exists instagram_shared_at timestamptz;
alter table referral_leads add column if not exists status text not null default 'Lead';
alter table referral_leads add column if not exists created_at timestamptz not null default now();
alter table referral_leads add column if not exists updated_at timestamptz not null default now();

alter table referral_leads alter column share_count set default 0;
alter table referral_leads alter column status set default 'Lead';

alter table referral_leads drop constraint if exists referral_leads_status_check;
alter table referral_leads
  add constraint referral_leads_status_check
  check (status in ('Lead'));

alter table referral_leads drop constraint if exists referral_leads_share_count_check;
alter table referral_leads
  add constraint referral_leads_share_count_check
  check (share_count >= 0);

create unique index if not exists idx_referral_leads_mobile_unique
  on referral_leads (mobile);

create unique index if not exists idx_referral_leads_referral_code_unique
  on referral_leads (referral_code);

create index if not exists idx_referral_leads_created_at
  on referral_leads (created_at desc);

create or replace function set_referral_leads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_referral_leads_updated_at on referral_leads;
create trigger trg_referral_leads_updated_at
  before update on referral_leads
  for each row
  execute function set_referral_leads_updated_at();

alter table referral_leads enable row level security;

drop policy if exists "service_role_referral_leads_all" on referral_leads;
create policy "service_role_referral_leads_all"
  on referral_leads for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table referral_leads is
  'Standalone referral-only leads captured outside participant registration.';
comment on column referral_leads.referral_code is
  'Human-readable standalone referral code; not tied to participant lead_id.';
comment on column referral_leads.referred_by is
  'Optional referral_code of the referrer who shared their link.';

-- Admin RBAC: authorization table separate from Supabase Auth (auth.users).

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  name text not null,
  email text not null,
  role text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  last_login_at timestamptz
);

alter table admin_users add column if not exists auth_user_id uuid;
alter table admin_users add column if not exists name text;
alter table admin_users add column if not exists email text;
alter table admin_users add column if not exists role text;
alter table admin_users add column if not exists status text not null default 'ACTIVE';
alter table admin_users add column if not exists created_at timestamptz not null default now();
alter table admin_users add column if not exists updated_at timestamptz not null default now();
alter table admin_users add column if not exists created_by uuid;
alter table admin_users add column if not exists last_login_at timestamptz;

alter table admin_users alter column status set default 'ACTIVE';

alter table admin_users drop constraint if exists admin_users_role_check;
alter table admin_users
  add constraint admin_users_role_check
  check (role in ('SUPER_ADMIN', 'ADMIN'));

alter table admin_users drop constraint if exists admin_users_status_check;
alter table admin_users
  add constraint admin_users_status_check
  check (status in ('ACTIVE', 'INACTIVE'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_auth_user_id_fkey'
  ) then
    alter table admin_users
      add constraint admin_users_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users (id)
      on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_created_by_fkey'
  ) then
    alter table admin_users
      add constraint admin_users_created_by_fkey
      foreign key (created_by)
      references admin_users (id)
      on delete set null;
  end if;
end $$;

create unique index if not exists idx_admin_users_auth_user_id_unique
  on admin_users (auth_user_id);

create unique index if not exists idx_admin_users_email_unique
  on admin_users (email);

create index if not exists idx_admin_users_role
  on admin_users (role);

create index if not exists idx_admin_users_status
  on admin_users (status);

create or replace function set_admin_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_admin_users_updated_at on admin_users;
create trigger trg_admin_users_updated_at
  before update on admin_users
  for each row
  execute function set_admin_users_updated_at();

alter table admin_users enable row level security;

drop policy if exists "service_role_admin_users_all" on admin_users;
create policy "service_role_admin_users_all"
  on admin_users for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table admin_users is
  'Admin authorization records linked to Supabase Auth users (auth.users).';
comment on column admin_users.auth_user_id is
  'Foreign key to auth.users.id; authentication is handled by Supabase Auth.';
comment on column admin_users.status is
  'ACTIVE admins may access the panel; INACTIVE is soft-delete (no hard delete).';
comment on column admin_users.created_by is
  'Super admin who provisioned this account, when applicable.';

notify pgrst, 'reload schema';
