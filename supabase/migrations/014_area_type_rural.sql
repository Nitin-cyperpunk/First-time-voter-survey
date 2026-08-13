-- Incremental only. Do NOT replay 001–013.
-- If 013 already ran with non_urban, this renames the tag to rural.
-- Safe no-op if 013 already used rural.

alter table public.cities drop constraint if exists cities_area_type_check;
update public.cities
set area_type = 'rural'
where area_type in ('local', 'non_urban');
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

alter table public.quota_cell_deltas drop constraint if exists quota_cell_deltas_area_type_check;
update public.quota_cell_deltas
set area_type = 'rural'
where area_type in ('local', 'non_urban');
alter table public.quota_cell_deltas
  add constraint quota_cell_deltas_area_type_check
  check (area_type in ('urban', 'rural'));

alter table public.quota_reallocations drop constraint if exists quota_reallocations_from_area_type_check;
alter table public.quota_reallocations drop constraint if exists quota_reallocations_to_area_type_check;
update public.quota_reallocations
set from_area_type = 'rural'
where from_area_type in ('local', 'non_urban');
update public.quota_reallocations
set to_area_type = 'rural'
where to_area_type in ('local', 'non_urban');
alter table public.quota_reallocations
  add constraint quota_reallocations_from_area_type_check
  check (from_area_type in ('urban', 'rural'));
alter table public.quota_reallocations
  add constraint quota_reallocations_to_area_type_check
  check (to_area_type in ('urban', 'rural'));

comment on column public.cities.area_type is
  'Admin-set operational tag (urban|rural). Never derived from Q15_2.';
comment on column public.screener_responses.config_area_type is
  'Snapshot of cities.area_type at submit. Operational quota tag — not Q15_2.';

notify pgrst, 'reload schema';
