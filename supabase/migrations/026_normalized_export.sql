-- Sarla-format normalized export map (flat question columns for CSV/Excel).

alter table screener_responses
  add column if not exists normalized_export jsonb;

alter table survey_responses
  add column if not exists normalized_export jsonb;

comment on column screener_responses.normalized_export is
  'Flat export map keyed by Qn.Label or Qn.Prefix-Option (Sarla export format).';

comment on column survey_responses.normalized_export is
  'Flat export map keyed by Qn.Label or Qn.Prefix-Option (Sarla export format).';

notify pgrst, 'reload schema';
