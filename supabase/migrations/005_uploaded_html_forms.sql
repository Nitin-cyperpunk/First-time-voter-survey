-- Store uploaded HTML forms directly in form_versions.

alter table form_versions add column if not exists html_content text;
alter table form_versions add column if not exists uploaded_file_name text;

notify pgrst, 'reload schema';
