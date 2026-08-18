-- 027: Flag hollow completes — status preserved, survey data gap recorded.
-- Apply manually after rule confirmation: supabase db push or SQL editor.
--
-- Does NOT revert participants.status. Used by QC, deliverable count, payout, export.

alter table public.participants
  add column if not exists survey_data_incomplete boolean not null default false;

alter table public.participants
  add column if not exists survey_data_incomplete_at timestamptz;

alter table public.participants
  add column if not exists survey_data_incomplete_reason text;

comment on column public.participants.survey_data_incomplete is
  'True when status is a qualified completion but stored survey answers are missing or empty. Set by mark_hollow_completes script or admin; preserves completed status history.';

create index if not exists idx_participants_survey_data_incomplete
  on public.participants (survey_data_incomplete)
  where survey_data_incomplete = true;
