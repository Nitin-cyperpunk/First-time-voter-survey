-- Incremental fix for an already-migrated database.
-- Do NOT replay 001–008. Run this file alone after 009 (and 010 if applied).
--
-- Anonymous FTV register writes participants.age_band. Live PostgREST
-- returned PGRST204: column missing from schema cache.

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

notify pgrst, 'reload schema';
