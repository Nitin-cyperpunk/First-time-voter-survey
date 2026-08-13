-- Incremental fix for an already-migrated Enamor database.
-- Do NOT replay 001–008. Run this file alone.
--
-- New participant inserts must mint CI_FTV_0001… not CI_EN_….
-- Existing CI_EN_ / EN_ lead_ids are left unchanged (they are PKs / FKs).

-- ---------------------------------------------------------------------------
-- 1. Point the sequence at lead_seq_ftv (rename legacy Enamor names if needed)
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.lead_seq_ftv') is null then
    if to_regclass('public.lead_seq_en') is not null then
      alter sequence public.lead_seq_en rename to lead_seq_ftv;
    elsif to_regclass('public.lead_seq_enamor') is not null then
      alter sequence public.lead_seq_enamor rename to lead_seq_ftv;
    elsif to_regclass('public.lead_seq') is not null then
      alter sequence public.lead_seq rename to lead_seq_ftv;
    elsif to_regclass('public.participant_lead_id_seq') is not null then
      alter sequence public.participant_lead_id_seq rename to lead_seq_ftv;
    end if;
  end if;
end $$;

create sequence if not exists public.lead_seq_ftv start with 1;

-- Continue after the highest EN or FTV numeric suffix already in the table.
select setval(
  'public.lead_seq_ftv',
  greatest(
    1,
    coalesce(
      (
        select max(substring(lead_id from '([0-9]+)$')::int)
        from public.participants
        where lead_id ~* '^(CI_FTV_|CI_EN_|EN_|EN)[0-9]+$'
      ),
      0
    ) + 1
  ),
  false
);

-- ---------------------------------------------------------------------------
-- 2. Formatter + BEFORE INSERT trigger → CI_FTV_####
-- ---------------------------------------------------------------------------

drop function if exists public.format_lead_id(bigint);

create or replace function public.format_lead_id(seq_val bigint)
returns text
language sql
immutable
as $$
  select 'CI_FTV_' || lpad(seq_val::text, 4, '0');
$$;

create or replace function public.assign_participant_lead_id()
returns trigger
language plpgsql
as $$
begin
  if new.lead_id is not null and btrim(new.lead_id) <> '' then
    return new;
  end if;

  new.lead_id := public.format_lead_id(nextval('public.lead_seq_ftv'));
  return new;
end;
$$;

drop trigger if exists trg_assign_participant_lead_id on public.participants;
create trigger trg_assign_participant_lead_id
  before insert on public.participants
  for each row
  execute function public.assign_participant_lead_id();

-- If lead_id still has a column default pointing at the old EN sequence, retarget it.
do $$
declare
  def text;
begin
  select column_default into def
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'participants'
    and column_name = 'lead_id';

  if def is not null then
    execute $sql$
      alter table public.participants
        alter column lead_id set default public.format_lead_id(nextval('public.lead_seq_ftv'))
    $sql$;
  end if;
end $$;

notify pgrst, 'reload schema';
