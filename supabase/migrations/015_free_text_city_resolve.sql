-- Incremental only. Do NOT replay 001–014.
-- Free-text city: match_key, aliases, raw/match_type on responses,
-- unmatched → global cap only, import audit log.

-- ---------------------------------------------------------------------------
-- 1. cities.match_key
-- ---------------------------------------------------------------------------

alter table public.cities
  add column if not exists match_key text;

update public.cities
set match_key = regexp_replace(lower(btrim(name)), '[^a-z0-9]+', '', 'g')
where match_key is null or match_key = '';

alter table public.cities
  alter column match_key set not null;

create index if not exists idx_cities_match_key on public.cities (match_key);
create index if not exists idx_cities_match_key_state
  on public.cities (match_key, lower(state));

comment on column public.cities.match_key is
  'Normalised lowercase alnum key for free-text city matching.';

-- ---------------------------------------------------------------------------
-- 2. city_aliases
-- ---------------------------------------------------------------------------

create table if not exists public.city_aliases (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete cascade,
  alias text not null,
  match_key text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.admin_users (id) on delete set null,
  unique (match_key)
);

create index if not exists idx_city_aliases_city_id on public.city_aliases (city_id);

alter table public.city_aliases enable row level security;
drop policy if exists "service_role_city_aliases_all" on public.city_aliases;
create policy "service_role_city_aliases_all"
  on public.city_aliases for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.city_aliases is
  'Free-text aliases that resolve to a config city (Bombay→Mumbai, etc.).';

-- Seed common aliases when the canonical city exists.
insert into public.city_aliases (city_id, alias, match_key)
select c.id, v.alias, v.match_key
from (
  values
    ('Bombay', 'bombay', 'Mumbai'),
    ('Bangalore', 'bangalore', 'Bengaluru'),
    ('Calcutta', 'calcutta', 'Kolkata'),
    ('Madras', 'madras', 'Chennai'),
    ('Poona', 'poona', 'Pune'),
    ('Baroda', 'baroda', 'Vadodara'),
    ('Gurgaon', 'gurgaon', 'Gurugram')
) as v(alias, match_key, city_name)
join public.cities c
  on c.match_key = regexp_replace(lower(v.city_name), '[^a-z0-9]+', '', 'g')
on conflict (match_key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Response raw city + match_type
-- ---------------------------------------------------------------------------

alter table public.screener_responses
  add column if not exists city_raw text;

alter table public.screener_responses
  add column if not exists city_match_type text
    check (
      city_match_type is null
      or city_match_type in ('exact', 'alias', 'unmatched')
    );

comment on column public.screener_responses.city_raw is
  'Respondent-typed city text before server resolution.';
comment on column public.screener_responses.city_match_type is
  'exact | alias | unmatched. Unmatched rows have city_id null and count only toward the global cap.';

alter table public.participants
  add column if not exists city_raw text;

alter table public.participants
  add column if not exists city_match_type text
    check (
      city_match_type is null
      or city_match_type in ('exact', 'alias', 'unmatched')
    );

-- city_id may be null for unmatched Completes (global-only quota).
alter table public.screener_responses
  alter column city_id drop not null;

-- ---------------------------------------------------------------------------
-- 4. City import audit
-- ---------------------------------------------------------------------------

create table if not exists public.city_import_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.admin_users (id) on delete set null,
  actor_email text,
  file_name text,
  rows_added integer not null default 0,
  rows_updated integer not null default 0,
  rows_rejected integer not null default 0,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.city_import_log enable row level security;
drop policy if exists "service_role_city_import_log_all" on public.city_import_log;
create policy "service_role_city_import_log_all"
  on public.city_import_log for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

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
      'city_alias'
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Screener insert: allow null city_id (unmatched → global only)
-- ---------------------------------------------------------------------------

-- CREATE OR REPLACE does not replace a changed signature — drop every known
-- overload first so COMMENT / GRANT are unambiguous.
drop function if exists public.insert_screener_response_with_capacity(
  text, text, integer, jsonb, text, text, jsonb, jsonb, jsonb, jsonb,
  timestamptz, timestamptz, integer, text, uuid, text
);
drop function if exists public.insert_screener_response_with_capacity(
  text, text, integer, jsonb, text, text, jsonb, jsonb, jsonb, jsonb,
  timestamptz, timestamptz, integer, text, uuid, text, text, text
);

create function public.insert_screener_response_with_capacity(
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
  p_self_reported_area_type text,
  p_city_raw text default null,
  p_city_match_type text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_cfg jsonb;
  v_form_status text;
  v_auto_close boolean;
  v_total_capacity integer;
  v_city public.cities%rowtype;
  v_row public.screener_responses%rowtype;
  v_limits record;
  v_global_count integer;
  v_state_count integer;
  v_cell_count integer;
  v_city_count integer;
  v_match_type text;
begin
  perform pg_advisory_xact_lock(hashtext('concave_screener_capacity'));

  select study_config into v_cfg
  from public.form_settings
  where form_type = 'registration'
  for update;

  v_cfg := coalesce(v_cfg, '{}'::jsonb);
  v_form_status := coalesce(v_cfg->>'form_status', 'open');
  v_auto_close := coalesce((v_cfg->>'auto_close_on_full')::boolean, false);
  v_total_capacity := coalesce((v_cfg->>'total_capacity')::integer, 200);
  v_match_type := nullif(trim(coalesce(p_city_match_type, '')), '');

  if v_form_status is distinct from 'open'
     or coalesce((v_cfg->>'survey_active')::boolean, true) is not true
     or coalesce((v_cfg->>'screener_open')::boolean, true) is not true
     or coalesce((v_cfg->>'project_open')::boolean, true) is not true then
    return jsonb_build_object('ok', false, 'code', 'form_closed');
  end if;

  if p_city_id is not null then
    select * into v_city
    from public.cities
    where id = p_city_id
    for update;

    if not found or v_city.is_active is not true then
      return jsonb_build_object('ok', false, 'code', 'city_inactive');
    end if;

    if coalesce(v_city.is_open, true) is not true then
      return jsonb_build_object('ok', false, 'code', 'city_full');
    end if;

    select * into v_limits from public.quota_limits_for_city(p_city_id);
  elsif nullif(trim(coalesce(p_city_raw, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'city_required');
  else
    v_match_type := coalesce(v_match_type, 'unmatched');
  end if;

  if p_completion_status = 'Completed' then
    v_global_count := public.count_qualified_completions(null, null, null);
    if v_global_count >= v_total_capacity then
      return jsonb_build_object('ok', false, 'code', 'study_full');
    end if;

    -- Matched cities check full hierarchy. Unmatched Completes consume global only.
    if p_city_id is not null then
      v_state_count := public.count_qualified_completions(null, v_limits.city_state, null);
      if v_state_count >= v_limits.state_alloc then
        return jsonb_build_object('ok', false, 'code', 'state_full');
      end if;

      v_cell_count := public.count_qualified_completions(
        null, v_limits.city_state, v_limits.city_area_type
      );
      if v_cell_count >= v_limits.cell_alloc then
        return jsonb_build_object('ok', false, 'code', 'cell_full');
      end if;

      v_city_count := public.count_qualified_completions(p_city_id, null, null);
      if v_city_count >= v_limits.city_closes_at then
        return jsonb_build_object('ok', false, 'code', 'city_full');
      end if;
    end if;
  end if;

  insert into public.screener_responses (
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
    config_state,
    self_reported_area_type,
    city_raw,
    city_match_type
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
    case when p_city_id is null then null else v_city.area_type end,
    case when p_city_id is null then null else v_city.state end,
    nullif(trim(p_self_reported_area_type), ''),
    nullif(trim(coalesce(p_city_raw, '')), ''),
    v_match_type
  )
  returning * into v_row;

  if p_completion_status = 'Completed'
     and v_auto_close
     and public.count_qualified_completions(null, null, null) >= v_total_capacity then
    update public.form_settings
    set study_config = jsonb_set(
      coalesce(study_config, '{}'::jsonb),
      '{form_status}',
      '"closed"'
    )
    where form_type = 'registration';

    insert into public.config_audit_log (
      actor_id, actor_email, entity_type, entity_id, field, old_value, new_value
    ) values (
      null, 'system', 'study_config', null, 'form_status', 'open', 'closed'
    );
  end if;

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$$;

comment on function public.insert_screener_response_with_capacity(
  text, text, integer, jsonb, text, text, jsonb, jsonb, jsonb, jsonb,
  timestamptz, timestamptz, integer, text, uuid, text, text, text
) is
  'Capacity under advisory lock. Matched city_id checks city→cell→state→study. Unmatched (null city_id) checks study only. Terminates increment nothing.';

revoke all on function public.insert_screener_response_with_capacity(
  text, text, integer, jsonb, text, text, jsonb, jsonb, jsonb, jsonb,
  timestamptz, timestamptz, integer, text, uuid, text, text, text
) from public;
grant execute on function public.insert_screener_response_with_capacity(
  text, text, integer, jsonb, text, text, jsonb, jsonb, jsonb, jsonb,
  timestamptz, timestamptz, integer, text, uuid, text, text, text
) to service_role;

-- FTV overlay: allow null city_id for unmatched Completes (global already claimed via screener).
create or replace function public.insert_ftv_response(
  p_respondent_id text,
  p_survey_version text,
  p_status text,
  p_payload jsonb,
  p_started_at timestamptz default null,
  p_completed_at timestamptz default null,
  p_terminated_at timestamptz default null,
  p_duration_seconds integer default null,
  p_lead_id text default null,
  p_city_id uuid default null,
  p_referral_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ftv_responses%rowtype;
  v_cfg jsonb;
  v_form_status text;
  v_limits record;
  v_screener_claimed boolean;
  v_global_count integer;
  v_state_count integer;
  v_cell_count integer;
  v_city_count integer;
  v_total integer;
begin
  perform pg_advisory_xact_lock(hashtext('concave_screener_capacity'));

  if p_status = 'COMPLETE' then
    select study_config into v_cfg
    from public.form_settings
    where form_type = 'registration'
    for update;

    v_cfg := coalesce(v_cfg, '{}'::jsonb);
    v_form_status := coalesce(v_cfg->>'form_status', 'open');
    v_total := coalesce((v_cfg->>'total_capacity')::integer, 200);

    if v_form_status is distinct from 'open' then
      return jsonb_build_object('ok', false, 'code', 'form_closed');
    end if;

    v_screener_claimed := exists (
      select 1
      from public.screener_responses
      where lead_id = p_lead_id
        and completion_status = 'Completed'
    );

    if not v_screener_claimed then
      return jsonb_build_object('ok', false, 'code', 'capacity_not_claimed');
    end if;

    v_global_count := public.count_qualified_completions(null, null, null);
    if v_global_count > v_total then
      return jsonb_build_object('ok', false, 'code', 'study_full');
    end if;

    if p_city_id is not null then
      select * into v_limits from public.quota_limits_for_city(p_city_id);
      if v_limits is null or v_limits.city_is_active is not true then
        return jsonb_build_object('ok', false, 'code', 'city_inactive');
      end if;

      v_state_count := public.count_qualified_completions(null, v_limits.city_state, null);
      v_cell_count := public.count_qualified_completions(null, v_limits.city_state, v_limits.city_area_type);
      v_city_count := public.count_qualified_completions(p_city_id, null, null);

      if v_state_count > v_limits.state_alloc then
        return jsonb_build_object('ok', false, 'code', 'state_full');
      end if;
      if v_cell_count > v_limits.cell_alloc then
        return jsonb_build_object('ok', false, 'code', 'cell_full');
      end if;
      if v_city_count > v_limits.city_closes_at then
        return jsonb_build_object('ok', false, 'code', 'city_full');
      end if;
    end if;
  end if;

  insert into public.ftv_responses (
    respondent_id,
    lead_id,
    city_id,
    referral_code,
    survey_version,
    status,
    started_at,
    completed_at,
    terminated_at,
    duration_seconds,
    payload
  ) values (
    p_respondent_id,
    p_lead_id,
    p_city_id,
    nullif(btrim(coalesce(p_referral_code, '')), ''),
    p_survey_version,
    p_status,
    p_started_at,
    p_completed_at,
    p_terminated_at,
    p_duration_seconds,
    p_payload
  )
  returning * into v_row;

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'duplicate_respondent_id');
  when check_violation then
    return jsonb_build_object('ok', false, 'code', 'invalid_status');
  when others then
    if sqlerrm like 'FTV_INVALID_PAYLOAD%' then
      return jsonb_build_object('ok', false, 'code', 'invalid_payload', 'error', sqlerrm);
    end if;
    raise;
end;
$$;

notify pgrst, 'reload schema';
