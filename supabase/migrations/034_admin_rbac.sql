-- Admin RBAC: authorization table separate from Supabase Auth (auth.users).

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  name text not null,
  email text not null,
  role text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  last_login_at timestamptz
);

alter table admin_users add column if not exists auth_user_id uuid;
alter table admin_users add column if not exists name text;
alter table admin_users add column if not exists email text;
alter table admin_users add column if not exists role text;
alter table admin_users add column if not exists status text not null default 'ACTIVE';
alter table admin_users add column if not exists created_at timestamptz not null default now();
alter table admin_users add column if not exists updated_at timestamptz not null default now();
alter table admin_users add column if not exists created_by uuid;
alter table admin_users add column if not exists last_login_at timestamptz;

alter table admin_users alter column status set default 'ACTIVE';

alter table admin_users drop constraint if exists admin_users_role_check;
alter table admin_users
  add constraint admin_users_role_check
  check (role in ('SUPER_ADMIN', 'ADMIN'));

alter table admin_users drop constraint if exists admin_users_status_check;
alter table admin_users
  add constraint admin_users_status_check
  check (status in ('ACTIVE', 'INACTIVE'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_auth_user_id_fkey'
  ) then
    alter table admin_users
      add constraint admin_users_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users (id)
      on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_created_by_fkey'
  ) then
    alter table admin_users
      add constraint admin_users_created_by_fkey
      foreign key (created_by)
      references admin_users (id)
      on delete set null;
  end if;
end $$;

create unique index if not exists idx_admin_users_auth_user_id_unique
  on admin_users (auth_user_id);

create unique index if not exists idx_admin_users_email_unique
  on admin_users (email);

create index if not exists idx_admin_users_role
  on admin_users (role);

create index if not exists idx_admin_users_status
  on admin_users (status);

create or replace function set_admin_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_admin_users_updated_at on admin_users;
create trigger trg_admin_users_updated_at
  before update on admin_users
  for each row
  execute function set_admin_users_updated_at();

alter table admin_users enable row level security;

drop policy if exists "service_role_admin_users_all" on admin_users;
create policy "service_role_admin_users_all"
  on admin_users for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table admin_users is
  'Admin authorization records linked to Supabase Auth users (auth.users).';
comment on column admin_users.auth_user_id is
  'Foreign key to auth.users.id; authentication is handled by Supabase Auth.';
comment on column admin_users.status is
  'ACTIVE admins may access the panel; INACTIVE is soft-delete (no hard delete).';
comment on column admin_users.created_by is
  'Super admin who provisioned this account, when applicable.';

notify pgrst, 'reload schema';
