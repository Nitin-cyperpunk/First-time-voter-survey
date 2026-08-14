-- Incremental only. Do NOT replay 001–018.
-- Inline unmatched-city classification: ignore list, over-quota flags, audit types.

-- ---------------------------------------------------------------------------
-- 1. Ignored / reviewed unmatched spellings (keyed by normalised match_key)
-- ---------------------------------------------------------------------------

create table if not exists public.city_unmatched_reviews (
  match_key text primary key,
  sample_raw text not null,
  status text not null check (status in ('ignored', 'resolved')),
  resolved_city_id uuid references public.cities (id) on delete set null,
  resolved_action text,
  over_quota_decision text,
  actor_id uuid references public.admin_users (id) on delete set null,
  actor_email text,
  response_count integer not null default 0,
  details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  restored_at timestamptz
);

comment on table public.city_unmatched_reviews is
  'Admin review of unmatched city spellings. ignored = hide from panel; resolved = audit trail after backfill.';

alter table public.city_unmatched_reviews enable row level security;
drop policy if exists "service_role_city_unmatched_reviews_all" on public.city_unmatched_reviews;
create policy "service_role_city_unmatched_reviews_all"
  on public.city_unmatched_reviews for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 2. Visible over-quota flag on state × area_type cells
-- ---------------------------------------------------------------------------

create table if not exists public.quota_cell_over_quota (
  state text not null,
  area_type text not null check (area_type in ('urban', 'rural')),
  flagged_at timestamptz not null default now(),
  flagged_by uuid references public.admin_users (id) on delete set null,
  reason text,
  primary key (state, area_type)
);

alter table public.quota_cell_over_quota enable row level security;
drop policy if exists "service_role_quota_cell_over_quota_all" on public.quota_cell_over_quota;
create policy "service_role_quota_cell_over_quota_all"
  on public.quota_cell_over_quota for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 3. Audit entity types for unmatched resolution
-- ---------------------------------------------------------------------------

alter table public.config_audit_log drop constraint if exists config_audit_log_entity_type_check;
alter table public.config_audit_log
  add constraint config_audit_log_entity_type_check
  check (
    entity_type in (
      'study_config',
      'city',
      'state_quota',
      'quota_reallocation',
      'city_import',
      'city_alias',
      'city_unmatched_resolve'
    )
  );
