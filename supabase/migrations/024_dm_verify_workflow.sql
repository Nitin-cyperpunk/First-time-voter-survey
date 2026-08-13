-- DM & Verify operational workflow status for eligible participants.

alter table participants
  add column if not exists dm_status text;

comment on column participants.dm_status is
  'Instagram DM verification workflow: waiting_for_dm, message_received, call_pending, verified, survey_link_sent, completed';

notify pgrst, 'reload schema';
