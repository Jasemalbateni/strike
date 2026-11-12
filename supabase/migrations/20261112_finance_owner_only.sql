-- ===== Finance module (owner-only) =====
-- Additive only: 4 new tables + 2 columns on subscriptions. Nothing existing is changed or removed.

-- payment method + gateway fee on each subscription payment
alter table public.subscriptions
  add column if not exists pay_method text not null default 'knet' check (pay_method in ('knet','card','cash','transfer')),
  add column if not exists fee numeric(10,3) not null default 0.200 check (fee >= 0);

-- recurring monthly lines: fixed costs, salaries, budgets
create table public.fin_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('fixed','salary','budget')),
  category text not null,
  title text not null,
  amount numeric(10,3) not null default 0 check (amount >= 0),
  branch_id uuid references public.branches(id) on delete set null,
  staff_id uuid references public.profiles(id) on delete set null,
  start_month date not null default (date_trunc('month', now() at time zone 'Asia/Kuwait'))::date,
  is_active boolean not null default true,
  position integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- the ledger: every expense line of a month
create table public.fin_entries (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  entry_date date not null,
  kind text not null check (kind in ('fixed','salary','expense')),
  category text not null,
  title text not null,
  amount numeric(10,3) not null default 0 check (amount >= 0),
  branch_id uuid references public.branches(id) on delete set null,
  staff_id uuid references public.profiles(id) on delete set null,
  item_id uuid references public.fin_items(id) on delete set null,
  paid boolean not null default false,
  paid_at date,
  notes text not null default '',
  voided_at timestamptz,
  void_reason text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, month)
);
create index fin_entries_month_idx on public.fin_entries (month);

-- salary deductions (absence / late / penalty)
create table public.fin_deductions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.fin_entries(id) on delete cascade,
  kind text not null check (kind in ('absence','late','penalty','other')),
  amount numeric(10,3) not null check (amount > 0),
  ded_date date not null,
  notes text not null default '',
  voided_at timestamptz,
  void_reason text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fin_deductions_entry_idx on public.fin_deductions (entry_id);

-- audit trail (written by triggers only)
create table public.fin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text not null default '',
  action text not null,
  entity text not null,
  entity_id uuid,
  month date,
  label text not null default '',
  old_amount numeric(10,3),
  new_amount numeric(10,3),
  note text not null default '',
  before jsonb,
  after jsonb
);
create index fin_audit_month_idx on public.fin_audit (month, at desc);

-- RLS: owner only, and nobody can delete (void instead)
alter table public.fin_items enable row level security;
alter table public.fin_entries enable row level security;
alter table public.fin_deductions enable row level security;
alter table public.fin_audit enable row level security;

create policy "fin_items owner read" on public.fin_items for select to authenticated using (public.is_owner());
create policy "fin_items owner insert" on public.fin_items for insert to authenticated with check (public.is_owner());
create policy "fin_items owner update" on public.fin_items for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "fin_entries owner read" on public.fin_entries for select to authenticated using (public.is_owner());
create policy "fin_entries owner insert" on public.fin_entries for insert to authenticated with check (public.is_owner());
create policy "fin_entries owner update" on public.fin_entries for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "fin_deductions owner read" on public.fin_deductions for select to authenticated using (public.is_owner());
create policy "fin_deductions owner insert" on public.fin_deductions for insert to authenticated with check (public.is_owner());
create policy "fin_deductions owner update" on public.fin_deductions for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "fin_audit owner read" on public.fin_audit for select to authenticated using (public.is_owner());

revoke all on public.fin_items, public.fin_entries, public.fin_deductions, public.fin_audit from anon;
revoke delete, truncate, references, trigger on public.fin_items, public.fin_entries, public.fin_deductions from authenticated;
revoke all on public.fin_audit from authenticated;
grant select on public.fin_audit to authenticated;

-- stamps
create trigger fin_items_created_by before insert on public.fin_items for each row execute function public.set_created_by();
create trigger fin_items_updated_at before update on public.fin_items for each row execute function public.set_updated_at();
create trigger fin_entries_created_by before insert on public.fin_entries for each row execute function public.set_created_by();
create trigger fin_entries_updated_at before update on public.fin_entries for each row execute function public.set_updated_at();
create trigger fin_deductions_created_by before insert on public.fin_deductions for each row execute function public.set_created_by();
create trigger fin_deductions_updated_at before update on public.fin_deductions for each row execute function public.set_updated_at();

-- audit trigger
create or replace function public.fin_audit_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  act text;
  who text;
  m date;
begin
  if tg_op = 'UPDATE' and (o - 'updated_at') = (n - 'updated_at') then return new; end if;
  select full_name into who from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    act := case when tg_table_name = 'fin_entries' and (n->>'item_id') is not null then 'auto' else 'create' end;
  elsif (o->>'voided_at') is null and (n->>'voided_at') is not null then act := 'void';
  elsif (o->>'voided_at') is not null and (n->>'voided_at') is null then act := 'restore';
  elsif (o->>'amount') is distinct from (n->>'amount') then act := 'amount';
  elsif (o->>'paid') is distinct from (n->>'paid') then act := case when (n->>'paid')::boolean then 'paid' else 'unpaid' end;
  else act := 'update';
  end if;
  if tg_table_name = 'fin_entries' then m := (n->>'month')::date;
  elsif tg_table_name = 'fin_deductions' then select e.month into m from public.fin_entries e where e.id = (n->>'entry_id')::uuid;
  end if;
  insert into public.fin_audit (actor_id, actor_name, action, entity, entity_id, month, label, old_amount, new_amount, note, before, after)
  values (auth.uid(), coalesce(who, 'النظام'), act, tg_table_name, (n->>'id')::uuid, m,
          coalesce(n->>'title', n->>'kind', ''), (o->>'amount')::numeric, (n->>'amount')::numeric,
          coalesce(nullif(n->>'void_reason', ''), ''), o, n);
  return new;
end $$;
revoke all on function public.fin_audit_log() from public, anon, authenticated;

create trigger fin_items_audit after insert or update on public.fin_items for each row execute function public.fin_audit_log();
create trigger fin_entries_audit after insert or update on public.fin_entries for each row execute function public.fin_audit_log();
create trigger fin_deductions_audit after insert or update on public.fin_deductions for each row execute function public.fin_audit_log();

-- open a month: copy the active recurring lines into the ledger (idempotent)
create or replace function public.fin_open_month(p_month date) returns void
language plpgsql security invoker set search_path = '' as $$
declare m date := date_trunc('month', p_month)::date;
begin
  if not public.is_owner() then raise exception 'owner only'; end if;
  if m > (date_trunc('month', now() at time zone 'Asia/Kuwait'))::date then return; end if;
  insert into public.fin_entries (month, entry_date, kind, category, title, amount, branch_id, staff_id, item_id)
  select m, m, i.kind, i.category, i.title, i.amount, i.branch_id, i.staff_id, i.id
  from public.fin_items i
  where i.is_active and i.kind in ('fixed','salary') and i.start_month <= m
  on conflict (item_id, month) do nothing;
end $$;
revoke all on function public.fin_open_month(date) from public, anon;
grant execute on function public.fin_open_month(date) to authenticated;

-- seed: Mishref, starting November 2026
insert into public.fin_items (kind, category, title, amount, staff_id, start_month, position) values
  ('fixed',  'pitch_rent',  'إيجار ملعب مشرف — عقد شهري ثابت', 250, null, date '2026-11-01', 0),
  ('salary', 'salary', 'جاسم الباطني — مدرب', 150, (select id from public.profiles where username = 'jasem'), date '2026-11-01', 1),
  ('salary', 'salary', 'يوسف بارون — مدرب', 150, (select id from public.profiles where username = 'yousef'), date '2026-11-01', 2),
  ('salary', 'salary', 'حمد الأمير — إداري', 120, (select id from public.profiles where username = 'hamad'), date '2026-11-01', 3),
  ('salary', 'salary', 'علي — التسويق وإدارة الأكاديمية', 80, (select id from public.profiles where username = 'ali'), date '2026-11-01', 4),
  ('fixed',  'office_rent', 'إيجار المكتب', 0, null, date '2026-11-01', 5),
  ('budget', 'marketing',   'ميزانية التسويق', 150, null, date '2026-11-01', 6);

insert into public.fin_entries (month, entry_date, kind, category, title, amount, branch_id, staff_id, item_id)
select date '2026-11-01', date '2026-11-01', i.kind, i.category, i.title, i.amount, i.branch_id, i.staff_id, i.id
from public.fin_items i where i.kind in ('fixed','salary')
on conflict (item_id, month) do nothing;
