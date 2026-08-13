-- Generic survey analytics payload (per-question timing, idle time, behaviour).

alter table screener_responses
  add column if not exists analytics jsonb;

alter table survey_responses
  add column if not exists analytics jsonb;

comment on column screener_responses.analytics is
  'Survey analytics engine payload: survey-level metrics and per-question timing/behaviour.';
comment on column survey_responses.analytics is
  'Survey analytics engine payload: survey-level metrics and per-question timing/behaviour.';

notify pgrst, 'reload schema';
