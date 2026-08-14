-- Incremental fix when POST /api/register fails with:
--   participants_status_check — status "terminated" rejected (23514)
--
-- Run after 003/004 if those were skipped, or to re-apply the allow-list safely.
-- Do NOT replay 001–016 in place.

alter table public.participants drop constraint if exists participants_status_check;

alter table public.participants
  add constraint participants_status_check
  check (
    status in (
      'terminated',
      'completed',
      'review_pass',
      'review_fail',
      'successful',
      'unsuccessful',
      'paid'
    )
  );

comment on column public.participants.status is
  'Lifecycle: terminated (screen-out) | completed | review_* | successful | unsuccessful | paid';

notify pgrst, 'reload schema';
