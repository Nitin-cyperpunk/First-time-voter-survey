-- Per-participant Instagram account visibility for admin Send routing.
-- public (default) = existing ig.me/m/{username} DM flow
-- private = open https://www.instagram.com/{handle} profile

alter table participants
  add column if not exists instagram_visibility text not null default 'public'
  check (instagram_visibility in ('public', 'private'));

comment on column participants.instagram_visibility is
  'Admin Send routing: public uses ig.me DM; private opens instagram.com/{handle} profile.';

notify pgrst, 'reload schema';
