-- Migration 026: Participant QC auto/override separation + append-only audit log.
--
-- AUTO status is computed in application code from duplicate + termination rules.
-- Only qc_status_override is stored on the row; recomputation never overwrites it.
--
-- DO NOT RUN without review. Command after approval:
--   supabase db push   (or apply manually in Supabase SQL editor)

alter table participants
  add column if not exists qc_status_override text default null;

alter table participants
  drop constraint if exists participants_qc_status_override_check;

alter table participants
  add constraint participants_qc_status_override_check
  check (
    qc_status_override is null
    or qc_status_override in ('pass', 'fail', 'review')
  );

comment on column participants.qc_status_override is
  'Admin QC override (pass/fail/review). NULL = automatic rules apply. '
  'Never written by duplicate recomputation — only explicit admin override RPC.';

create table if not exists participant_qc_override_log (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references participants(lead_id) on delete cascade,
  previous_auto_status text not null
    check (previous_auto_status in ('pass', 'fail', 'review')),
  new_auto_status text not null
    check (new_auto_status in ('pass', 'fail', 'review')),
  previous_effective_status text not null
    check (previous_effective_status in ('pass', 'fail', 'review')),
  new_effective_status text not null
    check (new_effective_status in ('pass', 'fail', 'review')),
  previous_override text
    check (
      previous_override is null
      or previous_override in ('pass', 'fail', 'review')
    ),
  new_override text not null
    check (new_override in ('pass', 'fail', 'review')),
  reason text not null,
  changed_by_admin_id uuid references admin_users(id) on delete set null,
  changed_by_email text not null,
  created_at timestamptz not null default now(),
  constraint participant_qc_override_log_reason_min
    check (char_length(trim(reason)) >= 10)
);

create index if not exists idx_participant_qc_override_log_lead_created
  on participant_qc_override_log (lead_id, created_at desc);

alter table participant_qc_override_log enable row level security;

drop policy if exists "service_role_participant_qc_override_log_all"
  on participant_qc_override_log;
create policy "service_role_participant_qc_override_log_all"
  on participant_qc_override_log for all
  using (true)
  with check (true);

comment on table participant_qc_override_log is
  'Append-only audit trail for admin QC overrides. Entries are never updated or deleted.';

-- Atomic override: log insert + participant update succeed or both roll back.
create or replace function apply_participant_qc_override(
  p_lead_id text,
  p_new_override text,
  p_reason text,
  p_previous_auto text,
  p_new_auto text,
  p_previous_effective text,
  p_new_effective text,
  p_previous_override text,
  p_admin_id uuid,
  p_admin_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_new_override is null
    or p_new_override not in ('pass', 'fail', 'review') then
    raise exception 'QC_OVERRIDE_INVALID_STATUS';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'QC_OVERRIDE_REASON_TOO_SHORT';
  end if;

  if not exists (
    select 1 from participants where lead_id = p_lead_id and deleted_at is null
  ) then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  insert into participant_qc_override_log (
    lead_id,
    previous_auto_status,
    new_auto_status,
    previous_effective_status,
    new_effective_status,
    previous_override,
    new_override,
    reason,
    changed_by_admin_id,
    changed_by_email
  ) values (
    p_lead_id,
    p_previous_auto,
    p_new_auto,
    p_previous_effective,
    p_new_effective,
    p_previous_override,
    p_new_override,
    trim(p_reason),
    p_admin_id,
    coalesce(nullif(trim(p_admin_email), ''), 'unknown')
  );

  update participants
  set qc_status_override = p_new_override
  where lead_id = p_lead_id
    and deleted_at is null;
end;
$$;
