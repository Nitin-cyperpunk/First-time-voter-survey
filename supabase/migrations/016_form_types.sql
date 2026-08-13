-- Generic form management: registration and survey share versioning with form_type.

alter table form_versions
  add column if not exists form_type text;

update form_versions
set form_type = 'registration'
where form_type is null;

alter table form_versions
  alter column form_type set not null;

alter table form_versions
  drop constraint if exists form_versions_form_type_check;

alter table form_versions
  add constraint form_versions_form_type_check
  check (form_type in ('registration', 'survey'));

drop index if exists idx_form_versions_version;

create unique index if not exists idx_form_versions_type_version
  on form_versions (form_type, version);

-- Per-type active version pointer
alter table form_settings
  add column if not exists form_type text;

update form_settings
set form_type = 'registration'
where form_type is null;

alter table form_settings
  alter column form_type set not null;

alter table form_settings
  drop constraint if exists form_settings_form_type_check;

alter table form_settings
  add constraint form_settings_form_type_check
  check (form_type in ('registration', 'survey'));

create unique index if not exists idx_form_settings_form_type
  on form_settings (form_type);

insert into form_settings (form_type, active_version)
select 'survey', 1
where not exists (
  select 1 from form_settings where form_type = 'survey'
);

-- Stamp survey responses with the form version answered.
alter table survey_responses
  add column if not exists form_version integer;

comment on column form_versions.form_type is
  'Form category: registration (public screener) or survey (eligible participants only).';
comment on column form_settings.form_type is
  'One active_version pointer per form_type.';
comment on column survey_responses.form_version is
  'Published survey form version the participant completed.';

notify pgrst, 'reload schema';
