-- Superadmin respondent deletion: soft-delete frees the city slot immediately.
-- Capacity is a live COUNT of Completed screener_responses with deleted_at IS NULL.
-- There is no stored counter. After delete, count_qualified_completions drops
-- in the same transaction; insert_screener_response_with_capacity re-reads that
-- count under pg_advisory_xact_lock, so two submits into one freed slot yield
-- exactly one success.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.participants
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.admin_users(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.screener_responses
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.admin_users(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.ftv_responses
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.admin_users(id) on delete set null,
  add column if not exists delete_reason text;

create index if not exists idx_participants_deleted_at
  on public.participants (deleted_at)
  where deleted_at is not null;

create index if not exists idx_screener_responses_deleted_at
  on public.screener_responses (deleted_at)
  where deleted_at is not null;

create index if not exists idx_ftv_responses_deleted_at
  on public.ftv_responses (deleted_at)
  where deleted_at is not null;

create index if not exists idx_screener_responses_city_completed_alive
  on public.screener_responses (city_id)
  where completion_status = 'Completed' and deleted_at is null;

-- Soft-deleted mobiles may be reused by a new lead_id.
alter table public.participants drop constraint if exists participants_mobile_key;
drop index if exists idx_participants_mobile_unique;
create unique index idx_participants_mobile_unique
  on public.participants (mobile)
  where mobile is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Live count: exclude soft-deleted rows
-- ---------------------------------------------------------------------------

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
    and sr.deleted_at is null
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
  'Live COUNT of Completed screener_responses with deleted_at IS NULL. Used by submit RPC and admin metrics. Soft-delete drops the count immediately; the advisory lock in insert_screener_response_with_capacity serializes two submits into one freed slot.';

-- Reopen a city when live count falls below cities.capacity (e.g. Mumbai
-- closed with is_open=false after an over-quota merge). Count >= capacity
-- still rejects submits even if is_open stays true.
create or replace function public.sync_city_open_from_count(p_city_id uuid)
returns void
language plpgsql
as $$
declare
  v_count integer;
  v_capacity integer;
begin
  if p_city_id is null then
    return;
  end if;

  select capacity into v_capacity
  from public.cities
  where id = p_city_id;

  if v_capacity is null then
    return;
  end if;

  v_count := public.count_qualified_completions(p_city_id, null, null);
  if v_count < v_capacity then
    update public.cities
    set is_open = true
    where id = p_city_id
      and is_open is distinct from true;
  end if;
end;
$$;

create or replace function public.trg_screener_sync_city_open()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_city_open_from_count(coalesce(new.city_id, old.city_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_screener_sync_city_open_upd on public.screener_responses;
create trigger trg_screener_sync_city_open_upd
after update of deleted_at, city_id, completion_status
on public.screener_responses
for each row
execute function public.trg_screener_sync_city_open();

drop trigger if exists trg_screener_sync_city_open_del on public.screener_responses;
create trigger trg_screener_sync_city_open_del
after delete on public.screener_responses
for each row
execute function public.trg_screener_sync_city_open();

-- ---------------------------------------------------------------------------
-- Analysis views: exclude soft-deleted FTV rows
-- ---------------------------------------------------------------------------

drop view if exists public.ftv_answers;
drop view if exists public.ftv_answers_all;
drop view if exists public.ftv_respondents;
drop view if exists public.ftv_respondents_all;
drop view if exists public.ftv_field_summary;

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
cross join lateral jsonb_array_elements(r.payload->'responses') with ordinality as t(a, n)
where r.deleted_at is null;

create or replace view public.ftv_answers_all
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
cross join lateral (select r.payload->'profile') as x(p)
where r.deleted_at is null;

-- Audit export (include deleted). Same shape as ftv_respondents plus deleted_at.
create or replace view public.ftv_respondents_all
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
  r.deleted_at,
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
where deleted_at is null
group by status
order by n desc;

revoke all on public.ftv_answers from public, anon, authenticated;
revoke all on public.ftv_answers_all from public, anon, authenticated;
revoke all on public.ftv_respondents from public, anon, authenticated;
revoke all on public.ftv_respondents_all from public, anon, authenticated;
revoke all on public.ftv_field_summary from public, anon, authenticated;
grant select on public.ftv_answers to service_role;
grant select on public.ftv_answers_all to service_role;
grant select on public.ftv_respondents to service_role;
grant select on public.ftv_respondents_all to service_role;
grant select on public.ftv_field_summary to service_role;

-- ---------------------------------------------------------------------------
-- Purge: keep referral rows; null the participant FKs instead of cascading
-- ---------------------------------------------------------------------------

alter table public.participants drop constraint if exists participants_referred_by_fkey;
alter table public.participants
  add constraint participants_referred_by_fkey
  foreign key (referred_by) references public.participants(lead_id)
  on delete set null;

alter table public.referrals drop constraint if exists referrals_referrer_lead_id_fkey;
alter table public.referrals
  add constraint referrals_referrer_lead_id_fkey
  foreign key (referrer_lead_id) references public.participants(lead_id)
  on delete set null;

alter table public.referrals drop constraint if exists referrals_referred_lead_id_fkey;
alter table public.referrals
  add constraint referrals_referred_lead_id_fkey
  foreign key (referred_lead_id) references public.participants(lead_id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- Merge helper: live count must ignore deleted rows
-- ---------------------------------------------------------------------------

create or replace function public.merge_city_into(
  p_survivor uuid,
  p_folded uuid,
  p_folded_alias text,
  p_folded_match_key text,
  p_close_if_over boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_survivor public.cities%rowtype;
  v_folded public.cities%rowtype;
  v_reassigned integer := 0;
  v_count integer := 0;
begin
  select * into v_survivor from public.cities where id = p_survivor;
  if not found then
    raise exception 'MERGE_SURVIVOR_MISSING: %', p_survivor;
  end if;

  select * into v_folded from public.cities where id = p_folded;
  if not found then
    v_count := public.count_qualified_completions(p_survivor, null, null);
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'survivor_id', p_survivor,
      'folded_id', p_folded,
      'reassigned', 0,
      'resulting_count', v_count
    );
  end if;

  update public.screener_responses
  set city_id = p_survivor
  where city_id = p_folded;
  get diagnostics v_reassigned = row_count;

  update public.participants
  set city_id = p_survivor
  where city_id = p_folded;

  update public.ftv_responses
  set city_id = p_survivor
  where city_id = p_folded;

  update public.city_aliases
  set city_id = p_survivor
  where city_id = p_folded;

  insert into public.city_aliases (city_id, alias, match_key)
  values (
    p_survivor,
    p_folded_alias,
    p_folded_match_key
  )
  on conflict (match_key) do update
    set city_id = excluded.city_id,
        alias = excluded.alias;

  v_count := public.count_qualified_completions(p_survivor, null, null);

  if p_close_if_over and v_count > v_survivor.capacity then
    update public.cities
    set is_open = false
    where id = p_survivor;
  end if;

  delete from public.cities where id = p_folded;

  insert into public.config_audit_log (
    actor_id, actor_email, entity_type, entity_id, field, old_value, new_value
  ) values (
    null,
    'system:024_respondent_soft_delete',
    'city',
    p_survivor,
    'city.merge',
    p_folded::text,
    format(
      'folded %s (%s) into %s (%s); reassigned %s responses; resulting_count %s',
      v_folded.name, p_folded, v_survivor.name, p_survivor, v_reassigned, v_count
    )
  );

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'survivor_id', p_survivor,
    'folded_id', p_folded,
    'reassigned', v_reassigned,
    'resulting_count', v_count,
    'closed', p_close_if_over and v_count > v_survivor.capacity
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS layer: authenticated ADMIN cannot UPDATE/DELETE these tables.
-- Superadmin may, via is_active_superadmin(). Next.js APIs still use
-- service_role (bypasses RLS) and must re-check SUPER_ADMIN in the handler.
-- ---------------------------------------------------------------------------

create or replace function public.is_active_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.auth_user_id = (select auth.uid())
      and au.role = 'SUPER_ADMIN'
      and au.status = 'ACTIVE'
  );
$$;

revoke all on function public.is_active_superadmin() from public;
grant execute on function public.is_active_superadmin() to authenticated;

revoke all on public.participants from anon;
revoke all on public.screener_responses from anon;
revoke all on public.ftv_responses from anon;

-- Authenticated gets table privileges; RLS then allows SUPER_ADMIN only.
-- ADMIN JWT + PostgREST still fails (no matching policy).
grant select, update, delete on public.participants to authenticated;
grant select, update, delete on public.screener_responses to authenticated;
grant select, update, delete on public.ftv_responses to authenticated;
revoke insert on public.participants from authenticated;
revoke insert on public.screener_responses from authenticated;
revoke insert on public.ftv_responses from authenticated;

drop policy if exists "superadmin_select_participants" on public.participants;
drop policy if exists "superadmin_update_participants" on public.participants;
drop policy if exists "superadmin_delete_participants" on public.participants;
create policy "superadmin_select_participants"
  on public.participants for select to authenticated
  using (public.is_active_superadmin());
create policy "superadmin_update_participants"
  on public.participants for update to authenticated
  using (public.is_active_superadmin())
  with check (public.is_active_superadmin());
create policy "superadmin_delete_participants"
  on public.participants for delete to authenticated
  using (public.is_active_superadmin());

drop policy if exists "superadmin_select_screener_responses" on public.screener_responses;
drop policy if exists "superadmin_update_screener_responses" on public.screener_responses;
drop policy if exists "superadmin_delete_screener_responses" on public.screener_responses;
create policy "superadmin_select_screener_responses"
  on public.screener_responses for select to authenticated
  using (public.is_active_superadmin());
create policy "superadmin_update_screener_responses"
  on public.screener_responses for update to authenticated
  using (public.is_active_superadmin())
  with check (public.is_active_superadmin());
create policy "superadmin_delete_screener_responses"
  on public.screener_responses for delete to authenticated
  using (public.is_active_superadmin());

drop policy if exists "superadmin_select_ftv_responses" on public.ftv_responses;
drop policy if exists "superadmin_update_ftv_responses" on public.ftv_responses;
drop policy if exists "superadmin_delete_ftv_responses" on public.ftv_responses;
create policy "superadmin_select_ftv_responses"
  on public.ftv_responses for select to authenticated
  using (public.is_active_superadmin());
create policy "superadmin_update_ftv_responses"
  on public.ftv_responses for update to authenticated
  using (public.is_active_superadmin())
  with check (public.is_active_superadmin());
create policy "superadmin_delete_ftv_responses"
  on public.ftv_responses for delete to authenticated
  using (public.is_active_superadmin());
