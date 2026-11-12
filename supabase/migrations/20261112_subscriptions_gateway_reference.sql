-- gateway reference for each subscription payment (audit trail against the UPayments deposits report)
alter table public.subscriptions
  add column if not exists pay_ref text not null default '',
  add column if not exists deposit_date date,
  add column if not exists payer_name text not null default '';
-- (November 2026 rows were then matched by hand to UPayments deposits report 56511.)
