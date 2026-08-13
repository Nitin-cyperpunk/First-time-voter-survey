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

notify pgrst, 'reload schema';
