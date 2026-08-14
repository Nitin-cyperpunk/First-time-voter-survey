-- Per-city qualified-complete limit of 12. Going forward only.
--
-- Existing responses are not deleted, invalidated, or excluded from counts.
-- Cities already over 12 stay as they are and stop taking new completes
-- because count >= cities.capacity.
--
-- enforce_capacity = true turns on the CITY check only.
-- Cell / state / study rejects stay in this function behind
-- study_config.enforce_quota_cascade (default false). No global cap.
-- auto_close_on_full stays false — fieldwork is closed via form_status.

-- 1) RPC first so a concurrent submit cannot hit the four-level cascade
--    after the flag is flipped.

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
  v_enforce boolean;
  v_cascade boolean;
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
  -- Serializes concurrent submits in this transaction. Ten completes at
  -- count 11 each re-read count_qualified_completions while holding the
  -- lock; only one insert proceeds per turn. Final count is 12, not 21.
  perform pg_advisory_xact_lock(hashtext('concave_screener_capacity'));

  select study_config into v_cfg
  from public.form_settings
  where form_type = 'registration'
  for update;

  v_cfg := coalesce(v_cfg, '{}'::jsonb);
  v_form_status := coalesce(v_cfg->>'form_status', 'open');
  v_enforce := coalesce((v_cfg->>'enforce_capacity')::boolean, false);
  v_cascade := coalesce((v_cfg->>'enforce_quota_cascade')::boolean, false);
  v_auto_close := coalesce((v_cfg->>'auto_close_on_full')::boolean, false);
  v_total_capacity := coalesce((v_cfg->>'total_capacity')::integer, 200);
  v_match_type := nullif(trim(coalesce(p_city_match_type, '')), '');

  -- Manual form_status is the only study-wide close. Mid-survey may finish.
  if v_form_status is distinct from 'open' and p_started_at is null then
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

    if v_enforce and coalesce(v_city.is_open, true) is not true then
      return jsonb_build_object('ok', false, 'code', 'city_full');
    end if;

    select * into v_limits from public.quota_limits_for_city(p_city_id);
  elsif nullif(trim(coalesce(p_city_raw, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'city_required');
  else
    -- Unmatched: city_id is null, so it attributes to no city and bypasses
    -- the per-city limit. Completes still count in the study total.
    v_match_type := coalesce(v_match_type, 'unmatched');
  end if;

  -- Completes only. Terminates and partials never consume a city slot.
  if v_enforce and p_completion_status = 'Completed' and p_city_id is not null then
    v_city_count := public.count_qualified_completions(p_city_id, null, null);
    if v_city_count >= v_city.capacity then
      return jsonb_build_object('ok', false, 'code', 'city_full');
    end if;

    -- Four-level cascade retained; not run unless explicitly enabled.
    if v_cascade then
      v_global_count := public.count_qualified_completions(null, null, null);
      if v_global_count >= v_total_capacity then
        return jsonb_build_object('ok', false, 'code', 'study_full');
      end if;

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

  -- Auto-close stays off for this study (auto_close_on_full = false).
  if v_enforce
     and v_cascade
     and p_completion_status = 'Completed'
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
  'Atomic insert under advisory lock. Completes increment count_qualified_completions; terminates do not. When enforce_capacity, reject city_full at cities.capacity. Unmatched bypass the city limit. Cell/state/study and auto-close run only if enforce_quota_cascade. Mid-survey may finish after form_status closed.';

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
  v_enforce boolean;
  v_cascade boolean;
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
    v_enforce := coalesce((v_cfg->>'enforce_capacity')::boolean, false);
    v_cascade := coalesce((v_cfg->>'enforce_quota_cascade')::boolean, false);
    v_total := coalesce((v_cfg->>'total_capacity')::integer, 200);

    v_screener_claimed := exists (
      select 1
      from public.screener_responses
      where lead_id = p_lead_id
        and completion_status = 'Completed'
    );

    if v_form_status is distinct from 'open'
       and not v_screener_claimed
       and p_started_at is null then
      return jsonb_build_object('ok', false, 'code', 'form_closed');
    end if;

    if not v_screener_claimed then
      return jsonb_build_object('ok', false, 'code', 'capacity_not_claimed');
    end if;

    -- Screener RPC already claimed the city slot. Do not re-reject the
    -- overlay for city_full (including cities that already exceed 12).
    -- Cascade retained behind enforce_quota_cascade.
    if v_enforce and v_cascade then
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
  'FTV overlay insert. City cap is enforced at screener insert. Cascade rejects run only when enforce_quota_cascade is true. Screener-claimed or started sessions may finish after form_status closed.';

-- Cell/state budget trigger (013) would reject 12 × city_count vs cell alloc.
-- That reconciliation is out of scope. Keep the function; skip it unless cascade is on.
-- Drop leftover 012 row-level budget triggers so a bulk city update is not scanned 6k times.
drop trigger if exists trg_cities_capacity_budget on public.cities;
drop trigger if exists trg_study_config_capacity_budget on public.form_settings;

create or replace function public.enforce_active_city_capacity_budget()
returns trigger
language plpgsql
as $$
declare
  v_cfg jsonb;
  v_cascade boolean;
  v_total integer;
  v_state_sum integer;
  v_cell record;
begin
  select study_config into v_cfg
  from public.form_settings
  where form_type = 'registration';

  v_cascade := coalesce((v_cfg->>'enforce_quota_cascade')::boolean, false);
  if not v_cascade then
    return null;
  end if;

  v_total := coalesce((v_cfg->>'total_capacity')::integer, 200);

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

comment on function public.enforce_active_city_capacity_budget() is
  'Cell/state capacity budget. Runs only when study_config.enforce_quota_cascade is true. Per-city 12 does not reconcile against cell allocations.';

-- 2) Per-city stored limit. Individual cities can be patched later.
alter table public.cities
  alter column capacity set default 12;

update public.cities
set
  capacity = 12,
  buffer = 0;

-- 3) Flag on, no global cap, no auto-close. New cities default to 12 from config.
update public.form_settings
set study_config = coalesce(study_config, '{}'::jsonb)
  || jsonb_build_object(
    'enforce_capacity', true,
    'enforce_quota_cascade', false,
    'auto_close_on_full', false,
    'default_city_capacity', 12
  )
where form_type = 'registration';

notify pgrst, 'reload schema';
