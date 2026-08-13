-- Per-question response time tracking and optimized Q-key answer storage.

alter table screener_responses
  add column if not exists response_times jsonb,
  add column if not exists total_duration_sec integer;

alter table survey_responses
  add column if not exists response_times jsonb,
  add column if not exists started_at timestamptz,
  add column if not exists total_duration_sec integer;

comment on column screener_responses.answers is
  'Question answers keyed by Q1, Q2, … (legacy rows may use full question text or field names).';
comment on column screener_responses.response_times is
  'Per-question dwell time in seconds, keyed by Q1, Q2, … matching answers.';
comment on column screener_responses.total_duration_sec is
  'Total form duration in seconds (submitted_at − started_at).';
comment on column survey_responses.response_times is
  'Per-question dwell time in seconds, keyed by Q1, Q2, … matching answers.';
comment on column survey_responses.total_duration_sec is
  'Total survey duration in seconds (submitted_at − started_at).';

-- Future admin analytics: average seconds per question per form version.
create or replace view v_screener_question_avg_times as
select
  sr.form_version,
  rt.key as question_key,
  round(avg((rt.value)::numeric), 1) as avg_seconds,
  count(*)::bigint as response_count
from screener_responses sr
cross join lateral jsonb_each(sr.response_times) rt
where sr.response_times is not null
group by sr.form_version, rt.key;

notify pgrst, 'reload schema';
