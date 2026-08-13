-- Participant Instagram username for admin DM workflow (ig.me/m/{username}).

alter table participants
  add column if not exists instagram_id text;

comment on column participants.instagram_id is
  'Normalized Instagram username (no @) for opening ig.me/m/{username} from DM & Verify.';

create index if not exists idx_participants_instagram_id
  on participants (instagram_id)
  where instagram_id is not null;

notify pgrst, 'reload schema';
