-- FTV analysis layer (additive). Does not alter 001–009 objects in place.
--
-- Reference: ftv_supabase_setup.sql (single-table + views + anon insert).
-- This project already has participants, referrals, cities, capacity RPC.
-- Superimpose the FTV payload table + views; keep the platform.
--
-- Deviations from the reference (intentional — audit items e/f/g/h/b):
--   (e) BEFORE INSERT/UPDATE trigger: TERMINATE_* → completed_at NULL,
--       duration_seconds = terminated_at − started_at.
--   (f) terminated_at is a real column and is exposed on ftv_respondents.
--   (g) status CHECK: COMPLETE | TERMINATE_NOT_FIRST_TIME |
--       TERMINATE_DID_NOT_VOTE | TERMINATE_AGE_OUT_OF_RANGE.
--       T02/T03/T04 are docs-only aliases, never stored.
--   (h) ftv_field_summary.avg_minutes is COMPLETE-only (terminate durations
--       do not pollute the completion average).
--   (b) RLS is service_role only. Do NOT grant anon INSERT WITH CHECK (true).
--       Capacity stays on insert_screener_response_with_capacity (008).
--
-- city_id is an optional FK beside payload.profile.city (free text).
-- cities.area_type (urban|local) is NOT Q15_2 (5-point area). Do not collapse.
-- Analysis of grid items must key on item_code, not item text (Q6b typo).

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table if not exists public.ftv_responses (
  id                bigint generated always as identity primary key,
  respondent_id     text        not null,
  lead_id           text        references public.participants(lead_id) on delete set null,
  city_id           uuid        references public.cities(id) on delete restrict,
  survey_version    text        not null,
  status            text        not null,
  started_at        timestamptz,
  completed_at      timestamptz,
  terminated_at     timestamptz,
  duration_seconds  integer,
  payload           jsonb       not null,
  created_at        timestamptz not null default now(),
  constraint ftv_responses_status_check check (
    status in (
      'COMPLETE',
      'TERMINATE_NOT_FIRST_TIME',
      'TERMINATE_DID_NOT_VOTE',
      'TERMINATE_AGE_OUT_OF_RANGE'
    )
  ),
  constraint ftv_responses_respondent_id_key unique (respondent_id)
);

create index if not exists ftv_responses_status_idx
  on public.ftv_responses (status);
create index if not exists ftv_responses_created_idx
  on public.ftv_responses (created_at desc);
create index if not exists ftv_responses_payload_idx
  on public.ftv_responses using gin (payload);
create index if not exists ftv_responses_lead_id_idx
  on public.ftv_responses (lead_id);
create index if not exists ftv_responses_city_id_idx
  on public.ftv_responses (city_id);

comment on table public.ftv_responses is
  'FTV-v1 full jsonb payload per respondent. Completes and terminates. Linked optionally to participants.lead_id and cities.id.';
comment on column public.ftv_responses.status is
  'COMPLETE | TERMINATE_NOT_FIRST_TIME (T02) | TERMINATE_DID_NOT_VOTE (T03) | TERMINATE_AGE_OUT_OF_RANGE (T04). T0x codes are not stored.';
comment on column public.ftv_responses.terminated_at is
  'Authoritative stop time for TERMINATE_*. NULL on COMPLETE.';
comment on column public.ftv_responses.completed_at is
  'Set on COMPLETE only. NULL on TERMINATE_* (trigger-enforced).';
comment on column public.ftv_responses.city_id is
  'Config city FK for capacity/quota. Independent of payload.profile.city text and of Q15_2 area type.';
comment on column public.ftv_responses.payload is
  'Full FTV answer_json: profile + responses[] (44–46 entries). Grid joins use item_code, not item text.';

-- ---------------------------------------------------------------------------
-- 2. Terminate timing (e) + structural validation (l)
-- ---------------------------------------------------------------------------

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
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ftv_normalize_terminate_timing on public.ftv_responses;
create trigger trg_ftv_normalize_terminate_timing
  before insert or update on public.ftv_responses
  for each row
  execute function public.ftv_normalize_terminate_timing();

create or replace function public.ftv_validate_payload_structure()
returns trigger
language plpgsql
as $$
declare
  v_n integer;
  v_q7 integer;
  v_q8 integer;
  v_responses jsonb;
begin
  v_responses := new.payload->'responses';
  if v_responses is null or jsonb_typeof(v_responses) <> 'array' then
    raise exception 'FTV_INVALID_PAYLOAD: payload.responses must be a jsonb array'
      using errcode = '23514';
  end if;

  v_n := jsonb_array_length(v_responses);
  if v_n < 44 or v_n > 46 then
    raise exception 'FTV_INVALID_PAYLOAD: responses must have 44–46 entries (got %)', v_n
      using errcode = '23514';
  end if;

  select count(*) into v_q7
  from jsonb_array_elements(v_responses) as e
  where e->>'type' = 'rank'
     or e->>'qid' like 'Q7_rank%';

  if v_q7 <> 3 then
    raise exception 'FTV_INVALID_PAYLOAD: Q7 must have exactly 3 rank entries (got %)', v_q7
      using errcode = '23514';
  end if;

  select count(*) into v_q8
  from jsonb_array_elements(v_responses) as e
  where e->>'type' = 'multi'
     or e->>'qid' like 'Q8%';

  if v_q8 < 1 or v_q8 > 3 then
    raise exception 'FTV_INVALID_PAYLOAD: Q8 must have 1–3 multi entries (got %)', v_q8
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ftv_validate_payload_structure on public.ftv_responses;
create trigger trg_ftv_validate_payload_structure
  before insert or update of payload on public.ftv_responses
  for each row
  execute function public.ftv_validate_payload_structure();

-- ---------------------------------------------------------------------------
-- 3. RLS — service_role only (do not ship anon insert)
-- ---------------------------------------------------------------------------

alter table public.ftv_responses enable row level security;

drop policy if exists "service_role_ftv_responses_all" on public.ftv_responses;
create policy "service_role_ftv_responses_all"
  on public.ftv_responses for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 4. Views
-- ---------------------------------------------------------------------------

create or replace view public.ftv_answers as
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

create or replace view public.ftv_respondents as
select
  r.respondent_id,
  r.lead_id,
  r.city_id,
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
cross join lateral (select r.payload->'profile') as x(p);

comment on view public.ftv_respondents is
  'One row per respondent. Age/gender live on profile (dob or age_band, gender), not Q15. Q15_1..3 are state/area/education only.';

create or replace view public.ftv_field_summary as
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

-- ---------------------------------------------------------------------------
-- 5. Insert RPC (service_role). Capacity is NOT enforced here — use 008 RPC.
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
  p_city_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ftv_responses%rowtype;
begin
  insert into public.ftv_responses (
    respondent_id,
    lead_id,
    city_id,
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

revoke all on function public.insert_ftv_response(
  text, text, text, jsonb, timestamptz, timestamptz, timestamptz, integer, text, uuid
) from public;
grant execute on function public.insert_ftv_response(
  text, text, text, jsonb, timestamptz, timestamptz, timestamptz, integer, text, uuid
) to service_role;

notify pgrst, 'reload schema';
