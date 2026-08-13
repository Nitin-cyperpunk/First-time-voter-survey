-- Consolidated screener lifecycle (011–016).
-- Screener unique only; form_type registration only; screener timing/analytics; status lifecycle.

-- T-11: Enforce one screener submission per lead_id.

delete from screener_responses a
using screener_responses b
where a.lead_id is not null
  and a.lead_id = b.lead_id
  and a.ctid > b.ctid;

delete from screener_responses where lead_id is null;

drop index if exists idx_screener_responses_lead_id_unique;

alter table screener_responses alter column lead_id set not null;

create unique index if not exists idx_screener_responses_lead_id_unique
  on screener_responses(lead_id);

-- T-13: Participant status lifecycle — normalize legacy statuses and enforce valid values.

update participants
set status = 'review_pass'
where status = 'qc_pass';

update participants
set status = 'review_fail'
where status = 'qc_fail';

update status_history
set status = 'review_pass', new_status = 'review_pass'
where coalesce(new_status, status) = 'qc_pass';

update status_history
set status = 'review_fail', new_status = 'review_fail'
where coalesce(new_status, status) = 'qc_fail';

alter table participants drop constraint if exists participants_status_check;
alter table participants
  add constraint participants_status_check
  check (
    status in (
      'lead',
      'eligible',
      'not_eligible',
      'completed',
      'review_pass',
      'review_fail',
      'successful',
      'unsuccessful'
    )
  );

-- T-48h: Harden participant_sessions for 48-hour persistent login.

alter table participant_sessions
  add column if not exists last_seen_at timestamptz default now();

alter table participant_sessions
  add column if not exists revoked_at timestamptz;

alter table participant_sessions
  alter column created_at set default now();

-- Fast lookup by participant for session reuse / revocation.
create index if not exists idx_participant_sessions_lead_id
  on participant_sessions(lead_id);

-- Backfill last_seen_at for any historical rows.
update participant_sessions
set last_seen_at = coalesce(last_seen_at, created_at, now())
where last_seen_at is null;

-- Per-question response time tracking and optimized Q-key answer storage.

alter table screener_responses
  add column if not exists response_times jsonb,
  add column if not exists total_duration_sec integer;

comment on column screener_responses.answers is
  'Question answers keyed by Q1, Q2, … (legacy rows may use full question text or field names).';
comment on column screener_responses.response_times is
  'Per-question dwell time in seconds, keyed by Q1, Q2, … matching answers.';
comment on column screener_responses.total_duration_sec is
  'Total form duration in seconds (submitted_at − started_at).';

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

-- Generic survey analytics payload (per-question timing, idle time, behaviour).

alter table screener_responses
  add column if not exists analytics jsonb;

comment on column screener_responses.analytics is
  'Survey analytics engine payload: survey-level metrics and per-question timing/behaviour.';

-- Generic form management: registration form versioning with form_type.

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
  check (form_type in ('registration'));

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
  check (form_type in ('registration'));

create unique index if not exists idx_form_settings_form_type
  on form_settings (form_type);

comment on column form_versions.form_type is
  'Form category: registration (public screener).';
comment on column form_settings.form_type is
  'One active_version pointer per form_type.';

notify pgrst, 'reload schema';
