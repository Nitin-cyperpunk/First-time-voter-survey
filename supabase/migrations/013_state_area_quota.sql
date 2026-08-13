-- Incremental only. Do NOT replay 001–012.
-- Four-level quota: global → state → urban/rural cell → city Closes At.
-- Completes only. Same advisory lock + count_qualified_completions.

-- ---------------------------------------------------------------------------
-- 1. area_type: local → rural
-- ---------------------------------------------------------------------------

alter table public.cities drop constraint if exists cities_area_type_check;
update public.cities set area_type = 'rural' where area_type in ('local', 'non_urban');
alter table public.cities
  add constraint cities_area_type_check
  check (area_type in ('urban', 'rural'));

alter table public.screener_responses drop constraint if exists screener_responses_config_area_type_check;
update public.screener_responses
set config_area_type = 'rural'
where config_area_type in ('local', 'non_urban');
alter table public.screener_responses
  add constraint screener_responses_config_area_type_check
  check (config_area_type is null or config_area_type in ('urban', 'rural'));

comment on column public.cities.area_type is
  'Admin-set operational tag (urban|rural). Never derived from Q15_2.';
comment on column public.screener_responses.config_area_type is
  'Snapshot of cities.area_type at submit. Operational quota tag — not Q15_2.';

-- ---------------------------------------------------------------------------
-- 2. City open flag + editable buffer (capacity = Closes At)
-- ---------------------------------------------------------------------------

alter table public.cities
  add column if not exists is_open boolean not null default true;
alter table public.cities
  add column if not exists buffer integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cities_buffer_check'
  ) then
    alter table public.cities add constraint cities_buffer_check check (buffer >= 0);
  end if;
end $$;

comment on column public.cities.capacity is
  'Closes At (submit enforcement). Target is derived as capacity - buffer.';
comment on column public.cities.buffer is
  'Editable buffer. Closes At = auto target + buffer.';
comment on column public.cities.is_open is
  'Closed cities are hidden from the respondent dropdown. Distinct from is_active.';

-- ---------------------------------------------------------------------------
-- 3. Snapshot config_state; lock Maharashtra typos onto Q15 list
-- ---------------------------------------------------------------------------

alter table public.screener_responses
  add column if not exists config_state text;

update public.cities
set state = 'Maharashtra'
where regexp_replace(lower(state), '[^a-z]', '', 'g') in (
  'maharashtra', 'maharahtra', 'maharahatra', 'maharahstra', 'maharastra'
);

update public.cities
set name = initcap(btrim(regexp_replace(name, '\s+', ' ', 'g')));

update public.screener_responses sr
set
  config_state = c.state,
  config_area_type = c.area_type
from public.cities c
where sr.city_id = c.id
  and (
    sr.config_state is null
    or sr.config_state is distinct from c.state
    or sr.config_area_type is distinct from c.area_type
  );

comment on column public.screener_responses.config_state is
  'Snapshot of cities.state at submit. Independent of Q15_1 voter-roll state.';

-- ---------------------------------------------------------------------------
-- 4. State allocations + cell deltas + reallocation audit
-- ---------------------------------------------------------------------------

create table if not exists public.study_state_allocations (
  state text primary key,
  allocation integer not null check (allocation >= 0),
  urban_pct integer not null default 50 check (urban_pct >= 0 and urban_pct <= 100),
  allocation_manual boolean not null default false,
  urban_pct_manual boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users (id) on delete set null
);

create table if not exists public.quota_cell_deltas (
  state text not null,
  area_type text not null check (area_type in ('urban', 'rural')),
  delta integer not null default 0,
  primary key (state, area_type)
);

create table if not exists public.quota_reallocations (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.admin_users (id) on delete set null,
  actor_email text,
  from_state text not null,
  from_area_type text not null check (from_area_type in ('urban', 'rural')),
  to_state text not null,
  to_area_type text not null check (to_area_type in ('urban', 'rural')),
  amount integer not null check (amount > 0),
  reason text,
  from_achieved integer,
  from_allocation_before integer,
  from_days_since_last_completion integer,
  created_at timestamptz not null default now()
);

alter table public.study_state_allocations enable row level security;
alter table public.quota_cell_deltas enable row level security;
alter table public.quota_reallocations enable row level security;

drop policy if exists "service_role_study_state_allocations_all" on public.study_state_allocations;
create policy "service_role_study_state_allocations_all"
  on public.study_state_allocations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_quota_cell_deltas_all" on public.quota_cell_deltas;
create policy "service_role_quota_cell_deltas_all"
  on public.quota_cell_deltas for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_quota_reallocations_all" on public.quota_reallocations;
create policy "service_role_quota_reallocations_all"
  on public.quota_reallocations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.config_audit_log drop constraint if exists config_audit_log_entity_type_check;
alter table public.config_audit_log
  add constraint config_audit_log_entity_type_check
  check (entity_type in ('study_config', 'city', 'state_quota', 'quota_reallocation'));

comment on table public.study_state_allocations is
  'Per-state quota. Default equal split of total_capacity; allocation_manual keeps admin override.';
comment on table public.quota_cell_deltas is
  'Soft-quota reallocation deltas applied on top of the 50:50 (or override) cell split.';
comment on table public.quota_reallocations is
  'Audit of manual cell→cell transfers: from/to/amount + days since last completion.';

-- Seed 50:50-safe state allocations that still cover live city Closes At.
insert into public.study_state_allocations (state, allocation, urban_pct)
select
  c.state,
  greatest(
    coalesce(sum(c.capacity), 0),
    2 * coalesce(sum(c.capacity) filter (where c.area_type = 'urban'), 0),
    greatest(
      2 * coalesce(sum(c.capacity) filter (where c.area_type = 'rural'), 0) - 1,
      0
    )
  )::integer,
  50
from public.cities c
where c.is_active
group by c.state
on conflict (state) do nothing;

update public.form_settings
set study_config = coalesce(study_config, '{}'::jsonb) || jsonb_build_object(
  'urban_non_urban_pct',
  coalesce((study_config->>'urban_non_urban_pct')::integer, 50),
  'quota_reallocation_min_fill_pct',
  coalesce((study_config->>'quota_reallocation_min_fill_pct')::integer, 25),
  'quota_reallocation_after_days',
  coalesce((study_config->>'quota_reallocation_after_days')::integer, 14),
  'quota_reallocation_max_transfer_pct',
  coalesce((study_config->>'quota_reallocation_max_transfer_pct')::integer, 50)
)
where form_type = 'registration';

-- ---------------------------------------------------------------------------
-- 5. Shared count: city / cell / state / global
-- ---------------------------------------------------------------------------

drop function if exists public.count_qualified_completions(uuid);

create or replace function public.count_qualified_completions(
  p_city_id uuid default null,
  p_state text default null,
  p_area_type text default null
)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from public.screener_responses sr
  left join public.cities c on c.id = sr.city_id
  where sr.completion_status = 'Completed'
    and (p_city_id is null or sr.city_id = p_city_id)
    and (
      p_state is null
      or coalesce(sr.config_state, c.state) = p_state
    )
    and (
      p_area_type is null
      or coalesce(sr.config_area_type, c.area_type) = p_area_type
    );
$$;

comment on function public.count_qualified_completions(uuid, text, text) is
  'Single source of truth for capacity + admin metrics. Completes only. Optional city / state / area_type filters.';

revoke all on function public.count_qualified_completions(uuid, text, text) from public;
grant execute on function public.count_qualified_completions(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Cell split + per-city quota limits (used by both submit RPCs)
-- ---------------------------------------------------------------------------

create or replace function public.quota_split_state(
  p_allocation integer,
  p_urban_pct integer,
  p_area_type text
)
returns integer
language plpgsql
immutable
as $$
declare
  v_alloc integer := greatest(coalesce(p_allocation, 0), 0);
  v_pct integer := coalesce(p_urban_pct, 50);
  v_urban integer;
  v_non_urban integer;
begin
  if v_pct = 50 then
    v_urban := v_alloc / 2;
    v_non_urban := v_alloc - v_urban;
  else
    v_urban := (v_alloc * v_pct) / 100;
    v_non_urban := v_alloc - v_urban;
  end if;
  if p_area_type = 'urban' then
    return v_urban;
  end if;
  return v_non_urban;
end;
$$;

create or replace function public.quota_limits_for_city(p_city_id uuid)
returns table (
  city_closes_at integer,
  cell_alloc integer,
  state_alloc integer,
  total_capacity integer,
  city_is_active boolean,
  city_is_open boolean,
  city_state text,
  city_area_type text
)
language plpgsql
stable
as $$
declare
  v_city public.cities%rowtype;
  v_cfg jsonb;
  v_total integer;
  v_state_alloc integer;
  v_urban_pct integer;
  v_n_states integer;
  v_delta integer;
  v_global_pct integer;
begin
  select * into v_city from public.cities where id = p_city_id;
  if not found then
    return;
  end if;

  select study_config into v_cfg
  from public.form_settings
  where form_type = 'registration';
  v_cfg := coalesce(v_cfg, '{}'::jsonb);
  v_total := coalesce((v_cfg->>'total_capacity')::integer, 200);
  v_global_pct := coalesce((v_cfg->>'urban_non_urban_pct')::integer, 50);

  select s.allocation, s.urban_pct
    into v_state_alloc, v_urban_pct
  from public.study_state_allocations s
  where s.state = v_city.state;

  if v_state_alloc is null then
    select count(distinct state)::integer into v_n_states
    from public.cities
    where is_active;
    if coalesce(v_n_states, 0) > 0 then
      v_state_alloc := v_total / v_n_states;
    else
      v_state_alloc := 0;
    end if;
    v_urban_pct := v_global_pct;
  end if;

  v_urban_pct := coalesce(v_urban_pct, v_global_pct, 50);

  select d.delta into v_delta
  from public.quota_cell_deltas d
  where d.state = v_city.state and d.area_type = v_city.area_type;
  v_delta := coalesce(v_delta, 0);

  city_closes_at := v_city.capacity;
  cell_alloc := public.quota_split_state(v_state_alloc, v_urban_pct, v_city.area_type) + v_delta;
  state_alloc := v_state_alloc;
  total_capacity := v_total;
  city_is_active := v_city.is_active;
  city_is_open := coalesce(v_city.is_open, true);
  city_state := v_city.state;
  city_area_type := v_city.area_type;
  return next;
end;
$$;

revoke all on function public.quota_split_state(integer, integer, text) from public;
revoke all on function public.quota_limits_for_city(uuid) from public;
grant execute on function public.quota_split_state(integer, integer, text) to service_role;
grant execute on function public.quota_limits_for_city(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Budget trigger: sum(state alloc) ≤ total_capacity; sum(city Closes At) ≤ cell
-- ---------------------------------------------------------------------------

create or replace function public.enforce_active_city_capacity_budget()
returns trigger
language plpgsql
as $$
declare
  v_total integer;
  v_state_sum integer;
  v_cell record;
begin
  select coalesce((study_config->>'total_capacity')::integer, 200)
    into v_total
  from public.form_settings
  where form_type = 'registration';

  select coalesce(sum(allocation), 0)::integer into v_state_sum
  from public.study_state_allocations;

  if v_state_sum > v_total then
    raise exception 'STATE_ALLOC_EXCEEDS_TOTAL: % > %', v_state_sum, v_total
      using errcode = 'P0001';
  end if;

  for v_cell in
    select
      c.state,
      c.area_type,
      sum(c.capacity) filter (where c.is_active)::integer as closes_at_sum,
      public.quota_split_state(
        coalesce(s.allocation, 0),
        coalesce(s.urban_pct, 50),
        c.area_type
      ) + coalesce(d.delta, 0) as cell_alloc
    from public.cities c
    left join public.study_state_allocations s on s.state = c.state
    left join public.quota_cell_deltas d
      on d.state = c.state and d.area_type = c.area_type
    group by c.state, c.area_type, s.allocation, s.urban_pct, d.delta
  loop
    if coalesce(v_cell.closes_at_sum, 0) > coalesce(v_cell.cell_alloc, 0) then
      raise exception 'CITY_CLOSES_AT_EXCEEDS_CELL: %|% closes_at % > cell %',
        v_cell.state, v_cell.area_type, v_cell.closes_at_sum, v_cell.cell_alloc
        using errcode = 'P0001';
    end if;
  end loop;

  return null;
end;
$$;

drop trigger if exists trg_enforce_active_city_capacity_budget on public.cities;
create trigger trg_enforce_active_city_capacity_budget
  after insert or update or delete on public.cities
  for each statement
  execute function public.enforce_active_city_capacity_budget();

drop trigger if exists trg_enforce_state_alloc_budget on public.study_state_allocations;
create trigger trg_enforce_state_alloc_budget
  after insert or update or delete on public.study_state_allocations
  for each statement
  execute function public.enforce_active_city_capacity_budget();

drop trigger if exists trg_enforce_cell_delta_budget on public.quota_cell_deltas;
create trigger trg_enforce_cell_delta_budget
  after insert or update or delete on public.quota_cell_deltas
  for each statement
  execute function public.enforce_active_city_capacity_budget();

-- ---------------------------------------------------------------------------
-- 8. Screener submit: four counts under one xact lock
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
  v_auto_close boolean;
  v_city public.cities%rowtype;
  v_row public.screener_responses%rowtype;
  v_limits record;
  v_global_count integer;
  v_state_count integer;
  v_cell_count integer;
  v_city_count integer;
begin
  -- Held until COMMIT. All four counts run inside this lock so concurrent
  -- submits at any boundary (city / cell / state / study) cannot both pass.
  perform pg_advisory_xact_lock(hashtext('concave_screener_capacity'));

  select study_config into v_cfg
  from public.form_settings
  where form_type = 'registration'
  for update;

  v_cfg := coalesce(v_cfg, '{}'::jsonb);
  v_form_status := coalesce(v_cfg->>'form_status', 'open');
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
  from public.cities
  where id = p_city_id
  for update;

  if not found or v_city.is_active is not true then
    return jsonb_build_object('ok', false, 'code', 'city_inactive');
  end if;

  if coalesce(v_city.is_open, true) is not true then
    return jsonb_build_object('ok', false, 'code', 'city_inactive');
  end if;

  select * into v_limits from public.quota_limits_for_city(p_city_id);

  -- Terminated / partial never consume capacity.
  if p_completion_status = 'Completed' then
    v_global_count := public.count_qualified_completions(null, null, null);
    if v_global_count >= v_limits.total_capacity then
      return jsonb_build_object('ok', false, 'code', 'study_full');
    end if;

    v_state_count := public.count_qualified_completions(null, v_limits.city_state, null);
    if v_state_count >= v_limits.state_alloc then
      return jsonb_build_object('ok', false, 'code', 'state_full');
    end if;

    v_cell_count := public.count_qualified_completions(null, v_limits.city_state, v_limits.city_area_type);
    if v_cell_count >= v_limits.cell_alloc then
      return jsonb_build_object('ok', false, 'code', 'cell_full');
    end if;

    v_city_count := public.count_qualified_completions(p_city_id, null, null);
    if v_city_count >= v_limits.city_closes_at then
      return jsonb_build_object('ok', false, 'code', 'city_full');
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
    v_city.state,
    nullif(trim(p_self_reported_area_type), '')
  )
  returning * into v_row;

  if p_completion_status = 'Completed'
     and v_auto_close
     and public.count_qualified_completions(null, null, null) >= v_limits.total_capacity then
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

comment on function public.insert_screener_response_with_capacity is
  'Inserts a screener_response under pg_advisory_xact_lock. Completes check city → cell → state → study. Terminates increment nothing.';

revoke all on function public.insert_screener_response_with_capacity(
  text, text, integer, jsonb, text, text, jsonb, jsonb, jsonb, jsonb,
  timestamptz, timestamptz, integer, text, uuid, text
) from public;
grant execute on function public.insert_screener_response_with_capacity(
  text, text, integer, jsonb, text, text, jsonb, jsonb, jsonb, jsonb,
  timestamptz, timestamptz, integer, text, uuid, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 9. FTV overlay: same four counts + same lock
-- ---------------------------------------------------------------------------

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
begin
  perform pg_advisory_xact_lock(hashtext('concave_screener_capacity'));

  if p_status = 'COMPLETE' then
    if p_city_id is null then
      return jsonb_build_object('ok', false, 'code', 'city_required');
    end if;

    select study_config into v_cfg
    from public.form_settings
    where form_type = 'registration'
    for update;

    v_cfg := coalesce(v_cfg, '{}'::jsonb);
    v_form_status := coalesce(v_cfg->>'form_status', 'open');

    if v_form_status is distinct from 'open' then
      return jsonb_build_object('ok', false, 'code', 'form_closed');
    end if;

    select * into v_limits from public.quota_limits_for_city(p_city_id);

    if v_limits is null or v_limits.city_is_active is not true then
      return jsonb_build_object('ok', false, 'code', 'city_inactive');
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
    v_state_count := public.count_qualified_completions(null, v_limits.city_state, null);
    v_cell_count := public.count_qualified_completions(null, v_limits.city_state, v_limits.city_area_type);
    v_city_count := public.count_qualified_completions(p_city_id, null, null);

    if v_global_count > v_limits.total_capacity then
      return jsonb_build_object('ok', false, 'code', 'study_full');
    end if;
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

comment on function public.insert_ftv_response is
  'Service-role FTV insert. COMPLETE re-checks four-level count_qualified_completions under the same advisory lock. Terminates skip capacity.';

revoke all on function public.insert_ftv_response(
  text, text, text, jsonb, timestamptz, timestamptz, timestamptz, integer, text, uuid, text
) from public;
grant execute on function public.insert_ftv_response(
  text, text, text, jsonb, timestamptz, timestamptz, timestamptz, integer, text, uuid, text
) to service_role;

notify pgrst, 'reload schema';
