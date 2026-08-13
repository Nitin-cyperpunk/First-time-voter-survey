-- Relational message templates (study-wide). Replaces JSONB as source of truth.

create table if not exists message_templates (
  id text primary key,
  name text not null,
  channel text not null check (channel in ('whatsapp', 'instagram')),
  body text not null default '',
  variables text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists message_templates_channel_active_idx
  on message_templates (channel)
  where is_active = true;

-- Seed from form_settings JSONB when present.
insert into message_templates (id, name, channel, body, variables, is_active, created_at, updated_at)
select
  key as id,
  coalesce(nullif(trim(value->>'title'), ''), key) as name,
  coalesce(value->>'channel', 'whatsapp') as channel,
  coalesce(value->>'template', '') as body,
  '{}'::text[] as variables,
  coalesce((value->>'enabled')::boolean, true) as is_active,
  now(),
  now()
from form_settings fs,
  lateral jsonb_each(fs.message_templates) as t(key, value)
where fs.form_type = 'registration'
  and jsonb_typeof(fs.message_templates) = 'object'
on conflict (id) do nothing;

notify pgrst, 'reload schema';
