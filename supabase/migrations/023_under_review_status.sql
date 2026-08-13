-- Allow the under_review status used during the post-registration eligibility journey.
-- New participants are inserted as under_review before an eligibility decision is made.

alter table participants drop constraint if exists participants_status_check;
alter table participants
  add constraint participants_status_check
  check (
    status in (
      'lead',
      'under_review',
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
