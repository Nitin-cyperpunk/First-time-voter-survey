-- Dynamic HTML form versions for admin-controlled registration

alter table form_versions add column if not exists name text;
alter table form_versions add column if not exists html_file_path text;

update form_versions
set
  name = coalesce(name, 'Innerwear Screener V1'),
  html_file_path = coalesce(html_file_path, '/forms/innerwear_screener_v1.html')
where version = 1;

insert into form_versions (version, name, html_file_path, schema, published)
select
  2,
  'Innerwear Screener V2',
  '/forms/innerwear_screener_v2.html',
  '{ "fields": [] }'::jsonb,
  true
where not exists (select 1 from form_versions where version = 2);

notify pgrst, 'reload schema';
