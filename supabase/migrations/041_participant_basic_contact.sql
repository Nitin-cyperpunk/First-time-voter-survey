-- Basic contact fields from registration screen 1 (not screener answers).
alter table participants
  add column if not exists email text,
  add column if not exists area text,
  add column if not exists pincode text;
