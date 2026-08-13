-- Flag-only duplicate device fingerprint detection (no blocking).

alter table participants
  add column if not exists duplicate_flag boolean not null default false,
  add column if not exists duplicate_reason text,
  add column if not exists duplicate_detected_at timestamptz,
  add column if not exists review_status text not null default 'Pending',
  add column if not exists original_participant_lead_id text;

alter table participants
  drop constraint if exists participants_review_status_check;

alter table participants
  add constraint participants_review_status_check
  check (review_status in ('Pending', 'Approved', 'Rejected'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'participants_original_participant_lead_id_fkey'
  ) then
    alter table participants
      add constraint participants_original_participant_lead_id_fkey
      foreign key (original_participant_lead_id)
      references participants (lead_id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_participants_duplicate_flag
  on participants (duplicate_flag);

create index if not exists idx_participants_review_status
  on participants (review_status);

create index if not exists idx_participants_device_fingerprint
  on participants (device_fingerprint);

alter table fingerprint_events
  add column if not exists original_participant_lead_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fingerprint_events_original_participant_lead_id_fkey'
  ) then
    alter table fingerprint_events
      add constraint fingerprint_events_original_participant_lead_id_fkey
      foreign key (original_participant_lead_id)
      references participants (lead_id)
      on delete set null;
  end if;
end $$;

comment on column participants.duplicate_flag is
  'True when this registration reused a device fingerprint seen on another participant.';
comment on column participants.duplicate_reason is
  'Human-readable reason when duplicate_flag is true.';
comment on column participants.review_status is
  'Admin review state for fingerprint duplicate flags: Pending, Approved, or Rejected.';

notify pgrst, 'reload schema';
