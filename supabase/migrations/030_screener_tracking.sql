-- Track whether each screener submission completed or was terminated, and why.

alter table screener_responses
  add column if not exists completion_status text,
  add column if not exists termination_reason text;

alter table screener_responses
  drop constraint if exists screener_responses_completion_status_check;

alter table screener_responses
  add constraint screener_responses_completion_status_check
  check (
    completion_status is null
    or completion_status in ('Completed', 'Terminated')
  );

comment on column screener_responses.completion_status is
  'Completed when the screener finished successfully; Terminated when screening ended early. NULL for legacy rows.';
comment on column screener_responses.termination_reason is
  'Business reason when completion_status is Terminated (e.g. Age not eligible, City not eligible).';

notify pgrst, 'reload schema';
