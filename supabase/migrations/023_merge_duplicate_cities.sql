-- Merge duplicate city records onto one cap of 12, then stop the split recurring.
-- Idempotent: safe if the folded city row is already gone.
--
-- Groups (canonical survivor <- folded):
--   Bengaluru <- Bangalore
--   Mumbai    <- Mumbai (maharahstra)
--   Delhi     <- New Delhi
--
-- Do NOT unique cities.match_key globally. Homonyms across states stay separate
-- (Hyderabad Telangana vs Uttar Pradesh, Siwan Bihar vs Haryana).

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
    -- Already merged.
    select count(*)::integer into v_count
    from public.screener_responses
    where city_id = p_survivor and completion_status = 'Completed';
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

  select count(*)::integer into v_count
  from public.screener_responses
  where city_id = p_survivor and completion_status = 'Completed';

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
    'system:023_merge_duplicate_cities',
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

-- One transaction per group (function body is a single transaction when called
-- from a statement that is not already in a subtransaction).
select public.merge_city_into(
  '150b3536-43ee-4e58-83a9-70de5d7394b7'::uuid,
  '8558e1ad-09a6-45ac-8350-83efe784d329'::uuid,
  'Bangalore',
  'bangalore',
  false
);
select public.merge_city_into(
  '71bf0386-cef9-4ebc-a212-527a8fe6aef7'::uuid,
  'ca11076f-e248-467d-be06-74ee97df8f89'::uuid,
  'Mumbai (maharahstra)',
  'mumbaimaharahstra',
  true
);
select public.merge_city_into(
  '6163bc55-aee2-4fb8-ba19-b21c47ae6f46'::uuid,
  'a52fc8e6-50cf-4b82-9d21-a41b4e83d27e'::uuid,
  'New Delhi',
  'newdelhi',
  false
);

-- A new/renamed city cannot steal a match_key that already aliases another city.
create or replace function public.ftv_reject_city_match_key_alias_collision()
returns trigger
language plpgsql
as $$
declare
  v_alias public.city_aliases%rowtype;
  v_target public.cities%rowtype;
begin
  select * into v_alias
  from public.city_aliases
  where match_key = new.match_key
    and city_id is distinct from new.id;
  if found then
    select * into v_target from public.cities where id = v_alias.city_id;
    raise exception 'CITY_MATCH_KEY_IS_ALIAS: % is already an alias of % (%)',
      new.match_key,
      coalesce(v_target.name, v_alias.alias),
      coalesce(v_target.state, 'existing city')
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cities_reject_alias_match_key on public.cities;
create trigger trg_cities_reject_alias_match_key
  before insert or update of match_key on public.cities
  for each row
  execute function public.ftv_reject_city_match_key_alias_collision();

-- Same spelling in the same state is one city. Same spelling in another state
-- (Hyderabad Telangana vs UP) stays allowed.
create unique index if not exists idx_cities_match_key_state_unique
  on public.cities (match_key, lower(state));
