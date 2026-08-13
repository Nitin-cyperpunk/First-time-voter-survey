-- Incremental only. Do NOT replay 001–011.
-- Combines post-011 FTV contract deltas that were previously edited into
-- 007–011 in place (form defaults, city budget, CI_FTV_ sequence, FTV overlay).
-- Idempotent: safe if some of those in-place edits already ran.

-- ---------------------------------------------------------------------------
-- 1. study_config defaults (was edited into 007)
-- ---------------------------------------------------------------------------

update public.form_settings
set study_config =
  coalesce(study_config, '{}'::jsonb)
  || jsonb_build_object(
    'form_status',
    coalesce(nullif(study_config->>'form_status', ''), 'open'),
    'total_capacity',
    coalesce((study_config->>'total_capacity')::integer, 200),
    'auto_close_on_full',
    coalesce((study_config->>'auto_close_on_full')::boolean, false)
  )
where form_type = 'registration';

-- ---------------------------------------------------------------------------
-- 2. participants age_band / PII nullability (was 011; IF NOT EXISTS no-op)
-- ---------------------------------------------------------------------------

alter table public.participants
  add column if not exists age_band text,
  add column if not exists email text,
  add column if not exists area text,
  add column if not exists pincode text;

comment on column public.participants.age_band is
  'Selected age band: 18 | 19 | 20 | 21 | 22 | 23+. No DOB.';

alter table public.participants alter column full_name set default 'Anonymous';

do $$
begin
  begin
    alter table public.participants alter column mobile drop not null;
  exception
    when others then null;
  end;
  begin
    alter table public.participants alter column dob drop not null;
  exception
    when others then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Lead IDs: sequence continues from CI_FTV_ only (was edited into 009)
-- ---------------------------------------------------------------------------

select setval(
  'public.lead_seq_ftv',
  greatest(
    1,
    coalesce(
      (
        select max(substring(lead_id from '([0-9]+)$')::int)
        from public.participants
        where lead_id ~ '^CI_FTV_[0-9]+$'
      ),
      0
    ) + 1
  ),
  false
);

-- ---------------------------------------------------------------------------
-- 4. City capacity budget (was edited into 008)
-- ---------------------------------------------------------------------------

comment on function public.count_qualified_completions(uuid) is
  'Single source of truth for capacity + admin metrics: qualified screener completions only. Terminated/partial never count. insert_screener_response_with_capacity and insert_ftv_response both call this.';

create or replace function public.enforce_active_city_capacity_budget()
returns trigger
language plpgsql
as $$
declare
  v_sum integer;
  v_total integer;
begin
  select coalesce(sum(capacity), 0)::integer
  into v_sum
  from public.cities
  where is_active;

  select coalesce((study_config->>'total_capacity')::integer, 200)
  into v_total
  from public.form_settings
  where form_type = 'registration';

  v_total := coalesce(v_total, 200);

  if v_sum > v_total then
    raise exception
      'CITY_CAPACITY_BUDGET: sum of active city capacities (%) exceeds total_capacity (%)',
      v_sum, v_total
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cities_capacity_budget on public.cities;
create trigger trg_cities_capacity_budget
  after insert or update of capacity, is_active or delete on public.cities
  for each row
  execute function public.enforce_active_city_capacity_budget();

drop trigger if exists trg_study_config_capacity_budget on public.form_settings;
create trigger trg_study_config_capacity_budget
  after update of study_config on public.form_settings
  for each row
  execute function public.enforce_active_city_capacity_budget();

-- ---------------------------------------------------------------------------
-- 5. ftv_responses overlay (was edited into 010)
-- ---------------------------------------------------------------------------

alter table public.ftv_responses
  add column if not exists referral_code text;

create index if not exists ftv_responses_referral_code_idx
  on public.ftv_responses (referral_code);

comment on column public.ftv_responses.referral_code is
  'Inbound referrer code snapshot (FTV+6). Own share code stays on participants.referral_code. Reward still fires on screener completion.';

create or replace function public.ftv_normalize_terminate_timing()
returns trigger
language plpgsql
as $$
begin
  if new.status like 'TERMINATE_%' then
    new.completed_at := null;
    if new.terminated_at is not null and new.started_at is not null then
      new.duration_seconds := greatest(
        0,
        (extract(epoch from (new.terminated_at - new.started_at)))::integer
      );
    end if;
  else
    new.terminated_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ftv_normalize_terminate_timing on public.ftv_responses;
create trigger trg_ftv_normalize_terminate_timing
  before insert or update on public.ftv_responses
  for each row
  execute function public.ftv_normalize_terminate_timing();

alter table public.ftv_responses enable row level security;

drop policy if exists "anon can insert responses" on public.ftv_responses;
drop policy if exists "service_role_ftv_responses_all" on public.ftv_responses;
create policy "service_role_ftv_responses_all"
  on public.ftv_responses for all
  to service_role
  using (true)
  with check (true);

revoke all on public.ftv_responses from public, anon, authenticated;
grant all on public.ftv_responses to service_role;

-- CREATE OR REPLACE cannot rename/reorder view columns (42P16).
drop view if exists public.ftv_field_summary;
drop view if exists public.ftv_respondents;
drop view if exists public.ftv_answers;

create or replace view public.ftv_answers
with (security_invoker = true) as
select
  r.respondent_id,
  r.lead_id,
  r.status,
  r.created_at,
  t.n                                     as answer_order,
  t.a->>'qid'                             as qid,
  t.a->>'question'                        as question,
  t.a->>'type'                            as question_type,
  coalesce(t.a->>'item', t.a->>'option')  as item,
  nullif(t.a->>'item_code','')::int       as item_code,
  nullif(t.a->>'rank','')::int            as rank_position,
  nullif(t.a->>'selection_order','')::int as selection_order,
  nullif(t.a->>'answer_code','')::numeric as answer_code,
  t.a->>'answer'                          as answer,
  t.a->>'other_text'                      as other_text,
  t.a->>'answer_original'                 as answer_original,
  t.a->>'script'                          as answer_script,
  t.a->>'spoken_language'                 as spoken_language
from public.ftv_responses r
cross join lateral jsonb_array_elements(r.payload->'responses') with ordinality as t(a, n);

comment on view public.ftv_answers is
  'One row per answer. Grid/Q6/Q14 analysis must group by item_code, not item text.';

create or replace view public.ftv_respondents
with (security_invoker = true) as
select
  r.respondent_id,
  r.lead_id,
  r.city_id,
  r.referral_code                          as inbound_referral_code,
  part.referral_code                       as own_referral_code,
  part.referred_by                         as referred_by_lead_id,
  r.survey_version,
  r.status,
  r.started_at,
  r.completed_at,
  r.terminated_at,
  r.duration_seconds,
  r.created_at,
  p->>'name'                               as name,
  p->>'email'                              as email,
  p->>'phone'                              as phone,
  p->>'area'                               as area,
  p->>'city'                               as city,
  p->>'age_band'                           as age_band,
  (p->'state'->>'code')::int               as state_code,
  p->'state'->>'label'                     as state,
  p->>'zip'                                as zip,
  (nullif(p->>'dob', ''))::date            as dob,
  (p->>'age_today')::numeric               as age_today,
  (p->>'age_at_poll')::numeric             as age_at_poll,
  (p->>'age_at_qualifying_date')::numeric  as age_at_qualifying_date,
  (p->'gender'->>'code')::int              as gender_code,
  coalesce(p->'gender'->>'label', p->>'gender') as gender,
  (p->'relationship_status'->>'code')::int as relationship_code,
  coalesce(p->'relationship_status'->>'label', p->>'relationship_status')
                                           as relationship_status,
  (r.payload->>'state_match')::boolean     as state_match,
  r.payload->>'consent'                    as consent,
  (r.payload->>'terms_accepted')::boolean  as terms_accepted,
  (r.payload->>'randomisation_seed')::bigint as randomisation_seed,
  r.payload->'display_order'->'Q6_blocks'  as order_q6_blocks,
  r.payload->'display_order'->'Q6a'        as order_q6a,
  r.payload->'display_order'->'Q6b'        as order_q6b,
  r.payload->'display_order'->'Q14'        as order_q14
from public.ftv_responses r
left join public.participants part on part.lead_id = r.lead_id
cross join lateral (select r.payload->'profile') as x(p);

comment on view public.ftv_respondents is
  'One row per respondent. terminated_at is a real column. inbound_referral_code is the FTV+6 used at submit; own_referral_code is this participant''s share code. Q15_2 ≠ cities.area_type.';

create or replace view public.ftv_field_summary
with (security_invoker = true) as
select
  status,
  count(*)                                           as n,
  round(100.0 * count(*) / sum(count(*)) over (), 1) as pct,
  round(
    avg(duration_seconds) filter (where status = 'COMPLETE') / 60.0,
    1
  )                                                  as avg_minutes,
  min(created_at)                                    as first_response,
  max(created_at)                                    as latest_response
from public.ftv_responses
group by status
order by n desc;

comment on view public.ftv_field_summary is
  'Funnel by status. avg_minutes is COMPLETE-only so terminate durations do not pollute it.';

revoke all on public.ftv_answers from public, anon, authenticated;
revoke all on public.ftv_respondents from public, anon, authenticated;
revoke all on public.ftv_field_summary from public, anon, authenticated;
grant select on public.ftv_answers to service_role;
grant select on public.ftv_respondents to service_role;
grant select on public.ftv_field_summary to service_role;

-- Same advisory lock + count_qualified_completions as 008 screener RPC.
-- COMPLETE overlay requires a Completed screener row (capacity already claimed).
-- Terminates skip capacity. 10 concurrent submits at 199 → exactly 200.

drop function if exists public.insert_ftv_response(
  text, text, text, jsonb, timestamptz, timestamptz, timestamptz, integer, text, uuid
);
drop function if exists public.insert_ftv_response(
  text, text, text, jsonb, timestamptz, timestamptz, timestamptz, integer, text, uuid, text
);

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
  v_total_capacity integer;
  v_city public.cities%rowtype;
  v_global_count integer;
  v_city_count integer;
  v_screener_claimed boolean;
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
    v_total_capacity := coalesce((v_cfg->>'total_capacity')::integer, 200);

    if v_form_status is distinct from 'open' then
      return jsonb_build_object('ok', false, 'code', 'form_closed');
    end if;

    select * into v_city
    from public.cities
    where id = p_city_id
    for update;

    if not found or v_city.is_active is not true then
      return jsonb_build_object('ok', false, 'code', 'city_inactive');
    end if;

    v_screener_claimed := exists (
      select 1
      from public.screener_responses
      where lead_id = p_lead_id
        and completion_status = 'Completed'
    );

    v_global_count := public.count_qualified_completions(null);
    v_city_count := public.count_qualified_completions(p_city_id);

    if v_screener_claimed then
      if v_global_count > v_total_capacity then
        return jsonb_build_object('ok', false, 'code', 'global_full');
      end if;
      if v_city_count > v_city.capacity then
        return jsonb_build_object('ok', false, 'code', 'region_full');
      end if;
    else
      return jsonb_build_object('ok', false, 'code', 'capacity_not_claimed');
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
  'Service-role FTV insert. COMPLETE re-checks count_qualified_completions under the same advisory lock as the screener RPC. Terminates skip capacity. Referral snapshot is p_referral_code; reward logic is unchanged.';

revoke all on function public.insert_ftv_response(
  text, text, text, jsonb, timestamptz, timestamptz, timestamptz, integer, text, uuid, text
) from public;
grant execute on function public.insert_ftv_response(
  text, text, text, jsonb, timestamptz, timestamptz, timestamptz, integer, text, uuid, text
) to service_role;

notify pgrst, 'reload schema';
