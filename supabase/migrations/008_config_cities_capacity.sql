-- Config tab: cities, operational area_type, capacity, audit, atomic submit lock.
-- form_status / total_capacity / auto_close_on_full live in form_settings.study_config (extended).

-- ---------------------------------------------------------------------------
-- Cities (operational quota tags — independent of Q15 self-reported area type)
-- ---------------------------------------------------------------------------

create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text not null,
  area_type text not null check (area_type in ('urban', 'local')),
  capacity integer not null check (capacity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references admin_users (id) on delete set null,
  updated_by uuid references admin_users (id) on delete set null
);

create index if not exists idx_cities_active on cities (is_active) where is_active = true;
create index if not exists idx_cities_state on cities (state);
create unique index if not exists idx_cities_name_state_unique
  on cities (lower(name), lower(state));

create or replace function set_cities_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cities_updated_at on cities;
create trigger trg_cities_updated_at
  before update on cities
  for each row
  execute function set_cities_updated_at();

alter table cities enable row level security;

drop policy if exists "service_role_cities_all" on cities;
create policy "service_role_cities_all"
  on cities for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table cities is
  'Operational city list with urban/local quota tags. Independent of respondent Q15 area type.';
comment on column cities.area_type is
  'Admin-set operational tag (urban|local). Never derived from Q15 self-reported area type.';

-- ---------------------------------------------------------------------------
-- Response-row geography: city_id FK + snapshot + Q15 column (distinct)
-- ---------------------------------------------------------------------------

alter table screener_responses
  add column if not exists city_id uuid references cities (id) on delete restrict;

alter table screener_responses
  add column if not exists config_area_type text
    check (config_area_type is null or config_area_type in ('urban', 'local'));

alter table screener_responses
  add column if not exists self_reported_area_type text;

create index if not exists idx_screener_responses_city_id
  on screener_responses (city_id);

create index if not exists idx_screener_responses_qualified
  on screener_responses (completion_status)
  where completion_status = 'Completed';

comment on column screener_responses.city_id is
  'FK to config cities. Deactivate a city instead of deleting if responses reference it.';
comment on column screener_responses.config_area_type is
  'Snapshot of cities.area_type at submit. Operational quota tag — not Q15.';
comment on column screener_responses.self_reported_area_type is
  'Q15 (or equivalent) self-reported 5-point area type. Never overwritten by cities.area_type.';

alter table participants
  add column if not exists city_id uuid references cities (id) on delete restrict;

create index if not exists idx_participants_city_id on participants (city_id);

-- ---------------------------------------------------------------------------
-- Config audit trail
-- ---------------------------------------------------------------------------

create table if not exists config_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references admin_users (id) on delete set null,
  actor_email text,
  entity_type text not null check (entity_type in ('study_config', 'city')),
  entity_id uuid,
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists idx_config_audit_log_created_at
  on config_audit_log (created_at desc);

alter table config_audit_log enable row level security;

drop policy if exists "service_role_config_audit_log_all" on config_audit_log;
create policy "service_role_config_audit_log_all"
  on config_audit_log for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Single reusable qualified-completion count (metrics + enforcement)
-- Only completion_status = 'Completed' counts. Terminated / partial / NULL do not.
-- ---------------------------------------------------------------------------

create or replace function public.count_qualified_completions(p_city_id uuid default null)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from screener_responses
  where completion_status = 'Completed'
    and (p_city_id is null or city_id = p_city_id);
$$;

comment on function public.count_qualified_completions(uuid) is
  'Single source of truth for capacity: qualified screener completions only.';

revoke all on function public.count_qualified_completions(uuid) from public;
grant execute on function public.count_qualified_completions(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Atomic insert + capacity claim
--
-- Race prevention: pg_advisory_xact_lock is held until this transaction commits.
-- Check (count) and INSERT run in the SAME function/transaction. Concurrent
-- callers block on the lock; the waiter re-reads the count after the first
-- commit. 10 parallel submits at global count 199 therefore yield exactly 200.
-- A select-count-then-insert from the app (two round trips) is NOT used.
-- ---------------------------------------------------------------------------

create or replace function public.insert_screener_response_with_capacity(
  p_lead_id text,
  p_mobile text,
  p_form_version integer,
  p_answers jsonb,
  p_completion_status text,
  p_termination_reason text,
  p_response_times jsonb,
  p_analytics jsonb,
  p_csv_row jsonb,
  p_normalized_export jsonb,
  p_started_at timestamptz,
  p_submitted_at timestamptz,
  p_total_duration_sec integer,
  p_ip_address text,
  p_city_id uuid,
  p_self_reported_area_type text
)
returns jsonb
language plpgsql
as $$
declare
  v_cfg jsonb;
  v_form_status text;
  v_total_capacity integer;
  v_auto_close boolean;
  v_city cities%rowtype;
  v_row screener_responses%rowtype;
  v_global_count integer;
  v_city_count integer;
begin
  -- Serialize all qualified (and closed-form) submits until commit.
  perform pg_advisory_xact_lock(hashtext('concave_screener_capacity'));

  select study_config into v_cfg
  from form_settings
  where form_type = 'registration'
  for update;

  v_cfg := coalesce(v_cfg, '{}'::jsonb);
  v_form_status := coalesce(v_cfg->>'form_status', 'open');
  v_total_capacity := coalesce((v_cfg->>'total_capacity')::integer, 200);
  v_auto_close := coalesce((v_cfg->>'auto_close_on_full')::boolean, false);

  if v_form_status is distinct from 'open'
     or coalesce((v_cfg->>'survey_active')::boolean, true) is not true
     or coalesce((v_cfg->>'screener_open')::boolean, true) is not true
     or coalesce((v_cfg->>'project_open')::boolean, true) is not true then
    return jsonb_build_object('ok', false, 'code', 'form_closed');
  end if;

  if p_city_id is null then
    return jsonb_build_object('ok', false, 'code', 'city_required');
  end if;

  select * into v_city
  from cities
  where id = p_city_id
  for update;

  if not found or v_city.is_active is not true then
    return jsonb_build_object('ok', false, 'code', 'city_inactive');
  end if;

  -- Terminated / partial never consume capacity. Qualified completions do.
  if p_completion_status = 'Completed' then
    v_global_count := public.count_qualified_completions(null);
    if v_global_count >= v_total_capacity then
      return jsonb_build_object('ok', false, 'code', 'global_full');
    end if;

    v_city_count := public.count_qualified_completions(p_city_id);
    if v_city_count >= v_city.capacity then
      return jsonb_build_object('ok', false, 'code', 'region_full');
    end if;
  end if;

  insert into screener_responses (
    lead_id,
    mobile,
    form_version,
    answers,
    completion_status,
    termination_reason,
    response_times,
    analytics,
    csv_row,
    normalized_export,
    started_at,
    submitted_at,
    total_duration_sec,
    ip_address,
    city_id,
    config_area_type,
    self_reported_area_type
  ) values (
    p_lead_id,
    p_mobile,
    p_form_version,
    coalesce(p_answers, '{}'::jsonb),
    p_completion_status,
    p_termination_reason,
    p_response_times,
    p_analytics,
    p_csv_row,
    p_normalized_export,
    p_started_at,
    coalesce(p_submitted_at, now()),
    p_total_duration_sec,
    p_ip_address,
    p_city_id,
    v_city.area_type,
    nullif(trim(p_self_reported_area_type), '')
  )
  returning * into v_row;

  if p_completion_status = 'Completed'
     and v_auto_close
     and public.count_qualified_completions(null) >= v_total_capacity then
    update form_settings
    set study_config = jsonb_set(
      coalesce(study_config, '{}'::jsonb),
      '{form_status}',
      '"closed"'
    )
    where form_type = 'registration';

    insert into config_audit_log (
      actor_id, actor_email, entity_type, entity_id, field, old_value, new_value
    ) values (
      null, 'system', 'study_config', null, 'form_status', 'open', 'closed'
    );
  end if;

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$$;

comment on function public.insert_screener_response_with_capacity is
  'Inserts a screener_response under an advisory xact lock so capacity check + insert cannot race.';

revoke all on function public.insert_screener_response_with_capacity(
  text, text, integer, jsonb, text, text, jsonb, jsonb, jsonb, jsonb,
  timestamptz, timestamptz, integer, text, uuid, text
) from public;
grant execute on function public.insert_screener_response_with_capacity(
  text, text, integer, jsonb, text, text, jsonb, jsonb, jsonb, jsonb,
  timestamptz, timestamptz, integer, text, uuid, text
) to service_role;

notify pgrst, 'reload schema';
