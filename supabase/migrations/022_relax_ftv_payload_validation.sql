-- Allow stored FTV payloads that the live form actually produces.
--
-- 010 required 44–46 response entries plus Q7=3 and Q8=1–3. Completes that
-- omit Q6b_10 (9 non-economic rows) and choose one Q8 source have 43 entries
-- and were rejected as invalid_status, so they never reached ftv_responses
-- or Excel. Partial / legacy Q-key rows also failed Q7/Q8 counts.
--
-- Keep a responses array and a sane upper bound. Enforce Q7/Q8 only when
-- those items are present.

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
  if v_n > 80 then
    raise exception 'FTV_INVALID_PAYLOAD: responses must have at most 80 entries (got %)', v_n
      using errcode = '23514';
  end if;

  select count(*) into v_q7
  from jsonb_array_elements(v_responses) as e
  where e->>'type' = 'rank'
     or e->>'qid' like 'Q7_rank%';

  if v_q7 not in (0, 3) then
    raise exception 'FTV_INVALID_PAYLOAD: Q7 must have 0 or 3 rank entries (got %)', v_q7
      using errcode = '23514';
  end if;

  select count(*) into v_q8
  from jsonb_array_elements(v_responses) as e
  where e->>'type' = 'multi'
     or e->>'qid' like 'Q8%';

  if v_q8 > 3 then
    raise exception 'FTV_INVALID_PAYLOAD: Q8 must have at most 3 multi entries (got %)', v_q8
      using errcode = '23514';
  end if;

  return new;
end;
$$;
