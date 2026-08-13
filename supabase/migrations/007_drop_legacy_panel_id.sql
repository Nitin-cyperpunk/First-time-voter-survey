-- Remove legacy panel_id column from older database schemas.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'participants'
      and column_name = 'panel_id'
  ) then
    alter table participants drop column panel_id;
  end if;
end $$;

notify pgrst, 'reload schema';
