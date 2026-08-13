-- T-12: Admin views — payouts, status_history audit fields, participant UPI

-- ---------------------------------------------------------------------------
-- status_history audit trail
-- ---------------------------------------------------------------------------
alter table status_history add column if not exists old_status text;
alter table status_history add column if not exists new_status text;
alter table status_history add column if not exists changed_by text default 'system';
alter table status_history add column if not exists notes text;

-- Backfill new_status from legacy status column when present
update status_history
set new_status = status
where new_status is null and status is not null;

-- ---------------------------------------------------------------------------
-- participants.upi_id (captured on survey / dashboard)
-- ---------------------------------------------------------------------------
alter table participants add column if not exists upi_id text;

-- ---------------------------------------------------------------------------
-- payouts — payment tracking per participant (earnings computed at read time)
-- ---------------------------------------------------------------------------
create table if not exists payouts (
  lead_id text primary key references participants(lead_id) on delete cascade,
  payment_status text not null default 'pending',
  payment_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Normalize existing payouts table if it was created with a different shape
alter table payouts add column if not exists payment_status text default 'pending';
alter table payouts add column if not exists payment_date timestamptz;
alter table payouts add column if not exists created_at timestamptz default now();
alter table payouts add column if not exists updated_at timestamptz default now();

alter table payouts drop constraint if exists payouts_payment_status_check;
alter table payouts
  add constraint payouts_payment_status_check
  check (payment_status in ('pending', 'ready', 'paid'));

update payouts set payment_status = 'pending' where payment_status is null;

alter table payouts enable row level security;

drop policy if exists "service_role_payouts_all" on payouts;
create policy "service_role_payouts_all"
  on payouts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
