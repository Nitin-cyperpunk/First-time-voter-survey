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

notify pgrst, 'reload schema';
