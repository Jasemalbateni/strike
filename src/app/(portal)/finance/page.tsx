import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProfile, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/page-header";
import { FIN_START, monthEnd, monthStart, num, shiftMonth, summarize, type FinAudit, type FinDeduction, type FinEntry, type FinItem, type FinSub, type MonthData, type PayMethod } from "@/lib/finance";
import FinanceBoard from "./finance-board";

export const metadata: Metadata = { title: "المالية" };

type SubRow = { id: string; player_id: string; start_date: string; amount: number; paid: boolean; paid_at: string | null; pay_method: PayMethod; fee: number; players: { full_name: string; branch_id: string | null } | { full_name: string; branch_id: string | null }[] | null };

/** everything money-related for one month. RLS returns nothing for non-owners. */
async function loadMonth(supabase: SupabaseClient, month: string): Promise<MonthData> {
  const end = monthEnd(month);
  const [entries, subs] = await Promise.all([
    supabase.from("fin_entries").select("*").eq("month", month).order("entry_date").order("created_at"),
    supabase
      .from("subscriptions")
      .select("id, player_id, start_date, amount, paid, paid_at, pay_method, fee, players(full_name, branch_id)")
      .or(`and(paid_at.gte.${month},paid_at.lt.${end}),and(start_date.gte.${month},start_date.lt.${end})`)
      .order("paid_at", { ascending: false }),
  ]);
  const entryRows = ((entries.data ?? []) as FinEntry[]).map((e) => ({ ...e, amount: num(e.amount) }));
  const ids = entryRows.filter((e) => e.kind === "salary").map((e) => e.id);
  const deds = ids.length ? await supabase.from("fin_deductions").select("*").in("entry_id", ids).order("ded_date") : { data: [] };
  return {
    entries: entryRows,
    deductions: ((deds.data ?? []) as FinDeduction[]).map((d) => ({ ...d, amount: num(d.amount) })),
    subs: ((subs.data ?? []) as unknown as SubRow[]).map((s) => {
      const p = Array.isArray(s.players) ? s.players[0] : s.players;
      return { id: s.id, player_id: s.player_id, player_name: p?.full_name ?? "—", branch_id: p?.branch_id ?? null, start_date: s.start_date, amount: num(s.amount), paid: s.paid, paid_at: s.paid_at, pay_method: s.pay_method ?? "knet", fee: num(s.fee) } satisfies FinSub;
    }),
  };
}

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const me = await getProfile();
  if (me.role !== "owner") redirect("/");
  const supabase = await createClient();
  const today = todayKW();
  const current = monthStart(today);

  const { m } = await searchParams;
  let month = typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? `${m}-01` : current;
  if (month < FIN_START) month = FIN_START;
  if (month > current) month = current;

  // make sure the month's fixed lines and salaries exist (idempotent, owner-only in SQL)
  await supabase.rpc("fin_open_month", { p_month: month });

  const prevMonth = shiftMonth(month, -1);
  const [data, prev, items, branches, audit] = await Promise.all([
    loadMonth(supabase, month),
    prevMonth >= FIN_START ? loadMonth(supabase, prevMonth) : Promise.resolve(null),
    supabase.from("fin_items").select("*").order("position").order("created_at"),
    supabase.from("branches").select("id, name").order("created_at"),
    supabase.from("fin_audit").select("id, at, actor_name, action, entity, label, old_amount, new_amount, note").or(`month.eq.${month},month.is.null`).order("at", { ascending: false }).limit(150),
  ]);
  const prevSum = prev ? summarize(prev, prevMonth) : null;

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-5xl">
      <PageHeader title="المالية" subtitle="الدخل والمصروف والصافي — لمالك الأكاديمية فقط" />
      <FinanceBoard
        key={month}
        month={month}
        today={today}
        canPrev={month > FIN_START}
        canNext={month < current}
        data={data}
        prev={prevSum ? { income: prevSum.income, expenses: prevSum.expenses, net: prevSum.net } : null}
        items={((items.data ?? []) as FinItem[]).map((i) => ({ ...i, amount: num(i.amount) }))}
        branches={(branches.data ?? []) as { id: string; name: string }[]}
        audit={(audit.data ?? []) as FinAudit[]}
      />
    </div>
  );
}
