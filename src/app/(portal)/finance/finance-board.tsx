"use client";

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Check, ChevronLeft, ChevronRight, Download, Pencil, Plus, TrendingDown, TrendingUp } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, Field, Modal } from "@/components/ui";
import { fmtDate } from "@/lib/players";
import {
  CATEGORY_LABEL,
  DEDUCTION_LABEL,
  EXPENSE_CATEGORIES,
  ITEM_KIND_LABEL,
  PAY_METHODS,
  PRICE_FULL,
  cardFee,
  catLabel,
  deductionsOf,
  entryNet,
  fmtKD,
  monthEnd,
  monthCsv,
  monthLabel,
  paidInMonth,
  payLabel,
  shiftMonth,
  summarize,
  type DeductionKind,
  type FinAudit,
  type FinCategory,
  type FinEntry,
  type FinItem,
  type FinSub,
  type ItemKind,
  type MonthData,
  type PayMethod,
} from "@/lib/finance";

type BranchLite = { id: string; name: string };
type Props = {
  month: string;
  today: string;
  canPrev: boolean;
  canNext: boolean;
  data: MonthData;
  prev: { income: number; expenses: number; net: number } | null;
  items: FinItem[];
  branches: BranchLite[];
  audit: FinAudit[];
};
type Tab = "summary" | "expenses" | "salaries" | "income" | "items" | "log";
const TABS: { v: Tab; label: string }[] = [
  { v: "summary", label: "الملخص" },
  { v: "expenses", label: "المصروفات" },
  { v: "salaries", label: "الرواتب" },
  { v: "income", label: "الدخل" },
  { v: "items", label: "البنود الثابتة" },
  { v: "log", label: "السجل" },
];

type Dialog =
  | { t: "expense"; entry?: FinEntry }
  | { t: "salary"; entry: FinEntry }
  | { t: "deduction"; entry: FinEntry }
  | { t: "void"; table: "fin_entries" | "fin_deductions"; id: string; label: string }
  | { t: "item"; item?: FinItem }
  | { t: "sub"; sub: FinSub }
  | null;

type DbResult = PromiseLike<{ error: { message: string } | null }>;

export default function FinanceBoard({ month, today, canPrev, canNext, data, prev, items, branches, audit }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("summary");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  const sum = useMemo(() => summarize(data, month), [data, month]);
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "عام";
  const budget = items.filter((i) => i.kind === "budget" && i.category === "marketing" && i.is_active && i.start_month <= month).reduce((a, i) => a + i.amount, 0);

  /** run a write, show a clear message on failure, then reload the month from the server */
  async function run(op: () => DbResult, done = true) {
    setBusy(true);
    setError("");
    const { error: e } = await op();
    setBusy(false);
    if (e) {
      setError("ما انحفظ التغيير — حاول مرة ثانية");
      return false;
    }
    if (done) setDialog(null);
    startRefresh(() => router.refresh());
    return true;
  }

  function exportCsv() {
    const blob = new Blob([monthCsv(data, month, branchName)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `strike-finance-${month.slice(0, 7)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const togglePaid = (e: FinEntry) => run(() => supabase.from("fin_entries").update({ paid: !e.paid, paid_at: e.paid ? null : today }).eq("id", e.id));

  const live = data.entries.filter((e) => !e.voided_at);
  const voided = data.entries.filter((e) => e.voided_at);
  const expenses = live.filter((e) => e.kind !== "salary");
  const salaries = live.filter((e) => e.kind === "salary");
  const paidSubs = data.subs.filter((s) => paidInMonth(s, month));
  const defaultDate = today >= month && today < monthEnd(month) ? today : month;

  return (
    <div className={clsx("flex flex-col gap-4", refreshing && "opacity-70 transition-opacity")}>
      {/* month switcher */}
      <div className="card px-2 py-2 flex items-center justify-between">
        <MonthLink href={`/finance?m=${shiftMonth(month, -1).slice(0, 7)}`} enabled={canPrev} label="الشهر السابق">
          <ChevronRight size={20} />
        </MonthLink>
        <div className="text-navy font-extrabold text-[18px]">{monthLabel(month)}</div>
        <MonthLink href={`/finance?m=${shiftMonth(month, 1).slice(0, 7)}`} enabled={canNext} label="الشهر التالي">
          <ChevronLeft size={20} />
        </MonthLink>
      </div>

      <div className="tabs-scroll flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)} className={clsx("chip h-10 px-4 text-[13.5px] whitespace-nowrap shrink-0", tab === t.v ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
            {t.label}
          </button>
        ))}
      </div>

      <button className="btn-outline self-start" onClick={exportCsv}>
        <Download size={17} /> تصدير تقرير {monthLabel(month)} (Excel)
      </button>

      {error && (
        <div role="alert" className="rounded-xl bg-error-100 text-error font-bold text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* ---------- summary ---------- */}
      {tab === "summary" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Big label="الدخل" value={sum.income} hint={`${sum.paidCount} دفعة اشتراك`} prev={prev?.income} goodWhenUp />
            <Big label="المصروف" value={sum.expenses} hint={sum.due > 0 ? `منها ${fmtKD(sum.due)} ما اندفعت للحين` : "كل البنود مدفوعة"} prev={prev?.expenses} />
            <Big label="الصافي" value={sum.net} hint={sum.net >= 0 ? "ربح" : "خسارة"} prev={prev?.net} goodWhenUp accent />
          </div>

          <BreakEven income={sum.income} out={sum.expenses + Math.max(0, budget - sum.marketingSpent)} />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="card p-4 sm:p-5">
              <h2 className="text-navy font-extrabold text-[16px] mb-3">وين راحت الفلوس</h2>
              {sum.byCategory.length === 0 ? (
                <p className="text-ink-2 text-sm">ما في مصروفات مسجلة هالشهر.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {sum.byCategory.map((c, i) => (
                    <Bar key={c.key} label={catLabel(c.key)} value={c.total} max={sum.byCategory[0].total} tag={i === 0 ? "أكبر بند" : undefined} />
                  ))}
                </div>
              )}
              {sum.deductionsTotal > 0 && <p className="text-ink-2 text-xs mt-3 num">الرواتب بعد خصومات {fmtKD(sum.deductionsTotal)} من أصل {fmtKD(sum.salaryGross)}.</p>}
            </div>

            <div className="flex flex-col gap-3">
              <div className="card p-4 sm:p-5">
                <h2 className="text-navy font-extrabold text-[16px] mb-3">الدخل حسب الفرع</h2>
                {sum.incomeByBranch.length === 0 ? (
                  <p className="text-ink-2 text-sm">ما في دفعات مسجلة هالشهر.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {sum.incomeByBranch.map((b, i) => (
                      <Bar key={b.branch_id ?? "none"} label={branchName(b.branch_id)} value={b.total} max={sum.incomeByBranch[0].total} sub={`${b.count} دفعة`} tag={sum.incomeByBranch.length > 1 ? (i === 0 ? "الأعلى" : i === sum.incomeByBranch.length - 1 ? "الأقل" : undefined) : undefined} tone="ice" />
                    ))}
                  </div>
                )}
              </div>

              <div className="card p-4 sm:p-5">
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="text-navy font-extrabold text-[16px]">ميزانية التسويق</h2>
                  <span className="num text-sm font-bold text-navy">
                    {fmtKD(sum.marketingSpent)} <span className="text-ink-2">من {fmtKD(budget)}</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-silver-100 overflow-hidden">
                  <div className={clsx("h-full rounded-full", sum.marketingSpent > budget ? "bg-error" : "bg-gold")} style={{ width: `${budget ? Math.min(100, (sum.marketingSpent / budget) * 100) : sum.marketingSpent ? 100 : 0}%` }} />
                </div>
                <p className={clsx("text-xs mt-2 num", sum.marketingSpent > budget ? "text-error font-bold" : "text-ink-2")}>{sum.marketingSpent > budget ? `تعديت الميزانية بـ ${fmtKD(sum.marketingSpent - budget)}` : `باقي ${fmtKD(budget - sum.marketingSpent)}`}</p>
              </div>

              {sum.unpaid.length > 0 && (
                <div className="card p-4 sm:p-5 border-gold">
                  <h2 className="text-navy font-extrabold text-[16px]">اشتراكات ما اندفعت</h2>
                  <p className="text-ink-2 text-sm mt-1 num">
                    {sum.unpaid.length} اشتراك بقيمة {fmtKD(sum.unpaidTotal)} — ما تنحسب بالدخل لين تندفع.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ---------- expenses ---------- */}
      {tab === "expenses" && (
        <>
          <button className="btn-primary self-start" onClick={() => setDialog({ t: "expense" })}>
            <Plus size={18} /> مصروف جديد
          </button>
          {expenses.length === 0 ? (
            <EmptyState title="ما في مصروفات" hint="سجّل أي مصروف أول ما يصير: تسويق، معدات، رسوم…" />
          ) : (
            <div className="card divide-y divide-silver-200">
              {expenses.map((e) => (
                <Row
                  key={e.id}
                  title={e.title}
                  meta={`${catLabel(e.category)} · ${fmtDate(e.entry_date)}${e.branch_id ? ` · ${branchName(e.branch_id)}` : ""}${e.kind === "fixed" ? " · ثابت شهري" : ""}`}
                  note={e.notes}
                  amount={e.amount}
                  paid={e.paid}
                  busy={busy}
                  onPaid={() => togglePaid(e)}
                  onEdit={() => setDialog({ t: "expense", entry: e })}
                  onVoid={() => setDialog({ t: "void", table: "fin_entries", id: e.id, label: e.title })}
                />
              ))}
            </div>
          )}
          <Voided entries={voided.filter((e) => e.kind !== "salary")} />
        </>
      )}

      {/* ---------- salaries ---------- */}
      {tab === "salaries" && (
        <>
          <p className="text-ink-2 text-sm">الراتب ينزل كل شهر بالمبلغ الأساسي. تقدر تعدّله أو تصفّره حسب أداء الفرع، وتضيف خصم غياب أو تأخير أو غرامة.</p>
          {salaries.length === 0 ? (
            <EmptyState title="ما في رواتب لهالشهر" hint="أضف الرواتب من «البنود الثابتة»." />
          ) : (
            salaries.map((e) => {
              const deds = deductionsOf(e.id, data.deductions);
              const net = entryNet(e, data.deductions);
              return (
                <div key={e.id} className="card p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-navy font-extrabold text-[16px]">{e.title}</div>
                      <div className="text-ink-2 text-xs mt-0.5 num">
                        الأساسي {fmtKD(e.amount)}
                        {e.notes && <> · {e.notes}</>}
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <div className="num text-navy text-[24px] font-bold leading-none">{fmtKD(net)}</div>
                      <div className="text-ink-2 text-[11px] mt-1">الصافي</div>
                    </div>
                  </div>
                  {deds.length > 0 && (
                    <div className="mt-3 rounded-xl bg-silver-100/70 divide-y divide-silver-200">
                      {deds.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="min-w-0 truncate">
                            <span className="font-bold text-navy">{DEDUCTION_LABEL[d.kind]}</span>
                            <span className="text-ink-2 num"> · {fmtDate(d.ded_date)}</span>
                            {d.notes && <span className="text-ink-2"> · {d.notes}</span>}
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            <span className="num font-bold text-error">− {fmtKD(d.amount)}</span>
                            <button className="h-9 w-9 grid place-items-center text-ink-2 hover:text-error" aria-label="إلغاء الخصم" onClick={() => setDialog({ t: "void", table: "fin_deductions", id: d.id, label: `خصم ${DEDUCTION_LABEL[d.kind]}` })}>
                              <Ban size={16} />
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <PaidButton paid={e.paid} busy={busy} onClick={() => togglePaid(e)} />
                    <button className="btn-outline h-10 text-sm" onClick={() => setDialog({ t: "deduction", entry: e })}>
                      <Plus size={16} /> خصم
                    </button>
                    <button className="btn-outline h-10 text-sm" onClick={() => setDialog({ t: "salary", entry: e })}>
                      <Pencil size={15} /> تعديل المبلغ
                    </button>
                  </div>
                </div>
              );
            })
          )}
          <button className="btn-ghost self-start" onClick={() => setDialog({ t: "expense", entry: undefined })}>
            <Plus size={18} /> مدرب بديل أو مكافأة (كمصروف)
          </button>
          <Voided entries={voided.filter((e) => e.kind === "salary")} />
        </>
      )}

      {/* ---------- income ---------- */}
      {tab === "income" && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Mini label="المحصّل" value={fmtKD(sum.income)} />
            <Mini label="رسوم الدفع" value={fmtKD(sum.fees)} />
            <Mini label="الصافي بعد الرسوم" value={fmtKD(sum.income - sum.fees)} />
          </div>
          <p className="text-ink-2 text-xs">الدفعات تتسجل من صفحة «اللاعبين» مع كل اشتراك. هنا تعدّل طريقة الدفع والرسوم (مثلاً دفعة فيزا).</p>
          {paidSubs.length === 0 ? (
            <EmptyState title="ما في دفعات هالشهر" />
          ) : (
            <div className="card divide-y divide-silver-200">
              {paidSubs.map((s) => (
                <button key={s.id} className="w-full text-start flex items-center justify-between gap-3 px-4 py-3 hover:bg-ice-50" onClick={() => setDialog({ t: "sub", sub: s })}>
                  <span className="min-w-0">
                    <span className="block font-bold text-navy truncate">{s.player_name}</span>
                    <span className="block text-ink-2 text-xs num">
                      {fmtDate(s.paid_at ?? s.start_date)} · {payLabel(s.pay_method)} · {branchName(s.branch_id)}
                    </span>
                    {s.pay_ref ? (
                      <span className="block text-ink-2 text-[11px] num" dir="ltr" style={{ textAlign: "right" }}>
                        #{s.pay_ref}
                      </span>
                    ) : (
                      <span className="block text-gold text-[11px] font-bold">بدون رقم فاتورة</span>
                    )}
                  </span>
                  <span className="text-end shrink-0">
                    <span className="block num font-bold text-navy text-[17px]">{fmtKD(s.amount)}</span>
                    <span className="block num text-ink-2 text-[11px]">رسوم {fmtKD(s.fee)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {sum.unpaid.length > 0 && (
            <div className="card p-4">
              <h3 className="text-navy font-extrabold mb-2">ما اندفعت</h3>
              {sum.unpaid.map((s) => (
                <div key={s.id} className="flex justify-between text-sm py-1.5">
                  <span className="text-navy font-bold">{s.player_name}</span>
                  <span className="num text-error font-bold">{fmtKD(s.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---------- recurring items ---------- */}
      {tab === "items" && (
        <>
          <p className="text-ink-2 text-sm">هذي البنود تنزل تلقائي أول كل شهر. تعديل المبلغ هنا يمشي على الشهور الجاية، وتقدر تطبّقه على الشهر المعروض بعد.</p>
          <div className="card divide-y divide-silver-200">
            {items.map((i) => (
              <button key={i.id} className={clsx("w-full text-start flex items-center justify-between gap-3 px-4 py-3 hover:bg-ice-50", !i.is_active && "opacity-50")} onClick={() => setDialog({ t: "item", item: i })}>
                <span className="min-w-0">
                  <span className="block font-bold text-navy truncate">{i.title}</span>
                  <span className="block text-ink-2 text-xs">
                    {ITEM_KIND_LABEL[i.kind]} · {catLabel(i.category)}
                    {!i.is_active && " · موقوف"}
                  </span>
                </span>
                <span className="num font-bold text-navy text-[17px] shrink-0">{fmtKD(i.amount)}</span>
              </button>
            ))}
          </div>
          <button className="btn-outline self-start" onClick={() => setDialog({ t: "item" })}>
            <Plus size={18} /> بند ثابت جديد
          </button>
        </>
      )}

      {/* ---------- audit log ---------- */}
      {tab === "log" && (
        <>
          <p className="text-ink-2 text-sm">كل عملية بالقسم المالي تتسجل هنا باسم اللي سواها. ما في حذف — بس إلغاء مع السبب.</p>
          {audit.length === 0 ? (
            <EmptyState title="السجل فاضي" />
          ) : (
            <div className="card divide-y divide-silver-200">
              {audit.map((a) => (
                <div key={a.id} className="px-4 py-2.5 text-sm">
                  <div className="text-navy font-bold">{auditText(a)}</div>
                  <div className="text-ink-2 text-xs num mt-0.5">
                    {a.actor_name} · {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuwait", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(a.at))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---------- dialogs ---------- */}
      {dialog?.t === "expense" && (
        <ExpenseModal
          entry={dialog.entry}
          defaultCategory={tab === "salaries" ? "substitute" : "marketing"}
          month={month}
          defaultDate={defaultDate}
          branches={branches}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={(v) =>
            run(() =>
              dialog.entry
                ? supabase.from("fin_entries").update({ ...v, paid_at: v.paid ? (dialog.entry?.paid_at ?? today) : null }).eq("id", dialog.entry?.id ?? "")
                : supabase.from("fin_entries").insert({ ...v, month, kind: "expense", paid_at: v.paid ? today : null }),
            )
          }
        />
      )}
      {dialog?.t === "salary" && <SalaryModal entry={dialog.entry} busy={busy} onClose={() => setDialog(null)} onSave={(amount, notes) => run(() => supabase.from("fin_entries").update({ amount, notes }).eq("id", dialog.entry.id))} />}
      {dialog?.t === "deduction" && (
        <DeductionModal entry={dialog.entry} month={month} defaultDate={defaultDate} busy={busy} onClose={() => setDialog(null)} onSave={(v) => run(() => supabase.from("fin_deductions").insert({ ...v, entry_id: dialog.entry.id }))} />
      )}
      {dialog?.t === "void" && <VoidModal label={dialog.label} busy={busy} onClose={() => setDialog(null)} onSave={(reason) => run(() => supabase.from(dialog.table).update({ voided_at: new Date().toISOString(), void_reason: reason }).eq("id", dialog.id))} />}
      {dialog?.t === "sub" && <SubModal sub={dialog.sub} busy={busy} onClose={() => setDialog(null)} onSave={(v) => run(() => supabase.from("subscriptions").update(v).eq("id", dialog.sub.id))} />}
      {dialog?.t === "item" && (
        <ItemModal
          item={dialog.item}
          monthName={monthLabel(month)}
          canApply={!!dialog.item && live.some((e) => e.item_id === dialog.item!.id && !e.paid)}
          branches={branches}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={async (v, applyNow) => {
            if (dialog.item) {
              const ok = await run(() => supabase.from("fin_items").update(v).eq("id", dialog.item!.id), !applyNow);
              if (ok && applyNow) await run(() => supabase.from("fin_entries").update({ amount: v.amount, title: v.title }).eq("item_id", dialog.item!.id).eq("month", month).eq("paid", false).is("voided_at", null));
            } else {
              const ok = await run(() => supabase.from("fin_items").insert({ ...v, start_month: month, position: items.length }), false);
              if (ok) await run(() => supabase.rpc("fin_open_month", { p_month: month }));
            }
          }}
        />
      )}
    </div>
  );
}

/* ---------- pieces ---------- */
function MonthLink({ href, enabled, label, children }: { href: string; enabled: boolean; label: string; children: ReactNode }) {
  if (!enabled) return <span className="h-11 w-11 grid place-items-center text-silver">{children}</span>;
  return (
    <Link href={href} aria-label={label} className="h-11 w-11 grid place-items-center rounded-xl text-navy hover:bg-navy-50">
      {children}
    </Link>
  );
}

function Big({ label, value, hint, prev, goodWhenUp, accent }: { label: string; value: number; hint: string; prev?: number; goodWhenUp?: boolean; accent?: boolean }) {
  const diff = prev === undefined ? null : value - prev;
  const good = diff === null || diff === 0 ? null : goodWhenUp ? diff > 0 : diff < 0;
  return (
    <div className={clsx("card p-4 sm:p-5", accent && (value >= 0 ? "bg-navy text-white border-navy" : "bg-error text-white border-error"))}>
      <div className={clsx("text-[13px] font-bold", accent ? "text-white/75" : "text-ink-2")}>{label}</div>
      <div className={clsx("num text-[34px] font-bold leading-none mt-2", !accent && "text-navy")} dir="ltr" style={{ textAlign: "right" }}>
        {fmtKD(value)}
      </div>
      <div className={clsx("text-xs mt-2 flex items-center gap-2 flex-wrap", accent ? "text-white/75" : "text-ink-2")}>
        <span>{hint}</span>
        {diff !== null && diff !== 0 && (
          <span className={clsx("chip num", accent ? "bg-white/15 text-white" : good ? "bg-ice-100 text-navy" : "bg-error-100 text-error")}>
            {diff > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {fmtKD(Math.abs(diff))} عن الشهر اللي قبله
          </span>
        )}
      </div>
    </div>
  );
}

function BreakEven({ income, out }: { income: number; out: number }) {
  const gap = out - income;
  const pct = out > 0 ? Math.min(100, (income / out) * 100) : 100;
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-navy font-extrabold text-[16px]">نقطة التعادل</h2>
        <span className="num text-sm font-bold text-navy">
          {fmtKD(income)} <span className="text-ink-2">من {fmtKD(out)}</span>
        </span>
      </div>
      <div className="h-3 rounded-full bg-silver-100 overflow-hidden">
        <div className={clsx("h-full rounded-full", gap > 0 ? "bg-ice" : "bg-navy")} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-ink-2 text-xs mt-2 num">
        {gap > 0 ? `باقي ${fmtKD(gap)} عشان تغطي التزامات الشهر (مع ميزانية التسويق كاملة) — يعني حوالي ${Math.ceil(gap / PRICE_FULL)} اشتراك.` : `غطيت التزامات الشهر وزدت ${fmtKD(-gap)}.`}
      </p>
    </div>
  );
}

function Bar({ label, value, max, tag, sub, tone = "navy" }: { label: string; value: number; max: number; tag?: string; sub?: string; tone?: "navy" | "ice" }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-bold text-navy flex items-center gap-2 min-w-0">
          <span className="truncate">{label}</span>
          {tag && <span className="chip bg-gold-100 text-navy-900 text-[10px] shrink-0">{tag}</span>}
        </span>
        <span className="num font-bold text-navy shrink-0">
          {fmtKD(value)}
          {sub && <span className="text-ink-2 font-normal"> · {sub}</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-silver-100 overflow-hidden mt-1.5">
        <div className={clsx("h-full rounded-full", tone === "ice" ? "bg-ice" : "bg-navy")} style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-3">
      <div className="text-ink-2 text-[11.5px] font-bold leading-tight">{label}</div>
      <div className="num text-navy text-[19px] font-bold leading-none mt-2">{value}</div>
    </div>
  );
}

function PaidButton({ paid, busy, onClick }: { paid: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button disabled={busy} onClick={onClick} aria-pressed={paid} className={clsx("btn h-10 text-sm", paid ? "bg-ice-100 text-navy" : "bg-gold-100 text-navy-900")}>
      {paid ? <Check size={16} /> : null} {paid ? "مدفوع" : "ما اندفع — اضغط للتسديد"}
    </button>
  );
}

function Row({ title, meta, note, amount, paid, busy, onPaid, onEdit, onVoid }: { title: string; meta: string; note: string; amount: number; paid: boolean; busy: boolean; onPaid: () => void; onEdit: () => void; onVoid: () => void }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-navy">{title}</div>
          <div className="text-ink-2 text-xs num mt-0.5">{meta}</div>
          {note && <div className="text-ink-2 text-xs mt-0.5">{note}</div>}
        </div>
        <div className="num font-bold text-navy text-[18px] shrink-0">{fmtKD(amount)}</div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <PaidButton paid={paid} busy={busy} onClick={onPaid} />
        <button className="btn-ghost h-10 w-10 px-0 ms-auto" aria-label="تعديل" onClick={onEdit}>
          <Pencil size={16} />
        </button>
        <button className="btn-ghost h-10 w-10 px-0 hover:text-error" aria-label="إلغاء البند" onClick={onVoid}>
          <Ban size={16} />
        </button>
      </div>
    </div>
  );
}

function Voided({ entries }: { entries: FinEntry[] }) {
  if (!entries.length) return null;
  return (
    <details className="card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-bold text-ink-2">بنود ملغية ({entries.length})</summary>
      <div className="mt-2 flex flex-col gap-2">
        {entries.map((e) => (
          <div key={e.id} className="flex justify-between gap-3 text-ink-2">
            <span className="min-w-0">
              <span className="line-through">{e.title}</span>
              {e.void_reason && <span> — {e.void_reason}</span>}
            </span>
            <span className="num line-through shrink-0">{fmtKD(e.amount)}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function auditText(a: FinAudit) {
  const what = a.entity === "fin_deductions" ? `خصم ${DEDUCTION_LABEL[a.label as DeductionKind] ?? a.label}` : a.entity === "fin_items" ? `بند ثابت «${a.label}»` : `«${a.label}»`;
  const amt = a.new_amount != null ? ` (${fmtKD(Number(a.new_amount))})` : "";
  switch (a.action) {
    case "auto":
      return `نزل تلقائي: ${what}${amt}`;
    case "create":
      return `إضافة ${what}${amt}`;
    case "void":
      return `إلغاء ${what}${a.note ? ` — ${a.note}` : ""}`;
    case "restore":
      return `استرجاع ${what}`;
    case "amount":
      return `تعديل مبلغ ${what} من ${fmtKD(Number(a.old_amount))} إلى ${fmtKD(Number(a.new_amount))}`;
    case "paid":
      return `تسديد ${what}${amt}`;
    case "unpaid":
      return `إرجاع ${what} إلى «ما اندفع»`;
    default:
      return `تعديل ${what}`;
  }
}

/* ---------- forms ---------- */
function Footer({ onClose, form, busy, label = "حفظ" }: { onClose: () => void; form: string; busy: boolean; label?: string }) {
  return (
    <>
      <button type="button" className="btn-ghost" onClick={onClose}>
        رجوع
      </button>
      <button form={form} className="btn-primary" disabled={busy}>
        {label}
      </button>
    </>
  );
}

function AmountInput({ value, onChange, step = "0.001" }: { value: string; onChange: (v: string) => void; step?: string }) {
  return <input className="field num" dir="ltr" type="number" inputMode="decimal" min={0} step={step} value={value} onChange={(e) => onChange(e.target.value)} required />;
}

type ExpenseValues = { title: string; category: string; amount: number; entry_date: string; branch_id: string | null; notes: string; paid: boolean };

function ExpenseModal({ entry, defaultCategory, month, defaultDate, branches, busy, onClose, onSave }: { entry?: FinEntry; defaultCategory: FinCategory; month: string; defaultDate: string; branches: BranchLite[]; busy: boolean; onClose: () => void; onSave: (v: ExpenseValues) => void }) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [category, setCategory] = useState(entry?.category ?? defaultCategory);
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [date, setDate] = useState(entry?.entry_date ?? defaultDate);
  const [branchId, setBranchId] = useState(entry?.branch_id ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [paid, setPaid] = useState(entry?.paid ?? true);
  const lastDay = shiftDay(monthEnd(month));

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({ title: title.trim() || catLabel(category), category, amount: Number(amount) || 0, entry_date: date, branch_id: branchId || null, notes: notes.trim(), paid });
  }
  return (
    <Modal open onClose={onClose} title={entry ? "تعديل المصروف" : "مصروف جديد"} footer={<Footer onClose={onClose} form="fin-expense" busy={busy} />}>
      <form id="fin-expense" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="المبلغ (د.ك)">
          <AmountInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="البند">
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)} disabled={entry?.kind === "fixed"}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الوصف" className="sm:col-span-2">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: إعلان انستغرام، أقماع، مدرب بديل ليوم الاثنين" />
        </Field>
        <Field label="التاريخ">
          <input className="field num" dir="ltr" type="date" min={month} max={lastDay} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="الفرع">
          <select className="field" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">عام (كل الأكاديمية)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ملاحظة" className="sm:col-span-2">
          <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <label className="flex items-center gap-3 sm:col-span-2 cursor-pointer select-none">
          <input type="checkbox" className="h-5 w-5 accent-[var(--navy)]" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          <span className="font-bold text-navy text-sm">اندفع</span>
        </label>
      </form>
    </Modal>
  );
}

/** the day before an ISO date (yyyy-MM-dd), without timezone drift */
function shiftDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function SalaryModal({ entry, busy, onClose, onSave }: { entry: FinEntry; busy: boolean; onClose: () => void; onSave: (amount: number, notes: string) => void }) {
  const [amount, setAmount] = useState(String(entry.amount));
  const [notes, setNotes] = useState(entry.notes);
  return (
    <Modal open onClose={onClose} title={`راتب هالشهر — ${entry.title}`} footer={<Footer onClose={onClose} form="fin-salary" busy={busy} />}>
      <form
        id="fin-salary"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(Number(amount) || 0, notes.trim());
        }}
        className="grid gap-4"
      >
        <Field label="المبلغ لهالشهر (د.ك)">
          <AmountInput value={amount} onChange={setAmount} />
        </Field>
        <button type="button" className="btn-outline self-start" onClick={() => setAmount("0")}>
          بدون راتب هالشهر
        </button>
        <Field label="السبب / ملاحظة">
          <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: حسب أداء الفرع" />
        </Field>
        <p className="text-ink-2 text-xs">التعديل على هالشهر بس. المبلغ الأساسي للشهور الجاية يتغير من «البنود الثابتة».</p>
      </form>
    </Modal>
  );
}

function DeductionModal({ entry, month, defaultDate, busy, onClose, onSave }: { entry: FinEntry; month: string; defaultDate: string; busy: boolean; onClose: () => void; onSave: (v: { kind: DeductionKind; amount: number; ded_date: string; notes: string }) => void }) {
  const [kind, setKind] = useState<DeductionKind>("absence");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [notes, setNotes] = useState("");
  return (
    <Modal open onClose={onClose} title={`خصم — ${entry.title}`} footer={<Footer onClose={onClose} form="fin-ded" busy={busy || !(Number(amount) > 0)} label="إضافة الخصم" />}>
      <form
        id="fin-ded"
        onSubmit={(e) => {
          e.preventDefault();
          if (Number(amount) > 0) onSave({ kind, amount: Number(amount), ded_date: date, notes: notes.trim() });
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="نوع الخصم" group className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(DEDUCTION_LABEL) as DeductionKind[]).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={clsx("chip h-10 px-4 text-sm", kind === k ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
                {DEDUCTION_LABEL[k]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="المبلغ (د.ك)">
          <AmountInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="التاريخ">
          <input className="field num" dir="ltr" type="date" min={month} max={shiftDay(monthEnd(month))} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="ملاحظة" className="sm:col-span-2">
          <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function VoidModal({ label, busy, onClose, onSave }: { label: string; busy: boolean; onClose: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={`إلغاء ${label}؟`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            رجوع
          </button>
          <button form="fin-void" className="btn-danger-solid" disabled={busy || !reason.trim()}>
            إلغاء البند
          </button>
        </>
      }
    >
      <form
        id="fin-void"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim()) onSave(reason.trim());
        }}
        className="grid gap-3"
      >
        <p className="text-ink-2 text-sm">البند يطلع من الحسبة ويبقى محفوظ بالسجل مع السبب.</p>
        <Field label="سبب الإلغاء">
          <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: انكتب بالغلط" required />
        </Field>
      </form>
    </Modal>
  );
}

function SubModal({ sub, busy, onClose, onSave }: { sub: FinSub; busy: boolean; onClose: () => void; onSave: (v: { pay_method: PayMethod; fee: number; pay_ref: string; deposit_date: string | null }) => void }) {
  const [method, setMethod] = useState<PayMethod>(sub.pay_method);
  const [fee, setFee] = useState(String(sub.fee));
  const [ref, setRef] = useState(sub.pay_ref);
  const [deposit, setDeposit] = useState(sub.deposit_date ?? "");
  return (
    <Modal open onClose={onClose} title={`دفعة ${sub.player_name}`} footer={<Footer onClose={onClose} form="fin-sub" busy={busy} />}>
      <form
        id="fin-sub"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ pay_method: method, fee: Number(fee) || 0, pay_ref: ref.replace(/^#/, "").trim(), deposit_date: deposit || null });
        }}
        className="grid gap-4"
      >
        <p className="num text-navy font-bold text-[20px]">{fmtKD(sub.amount)}</p>
        <Field label="طريقة الدفع" group>
          <div className="flex flex-wrap gap-2">
            {PAY_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={method === m.value}
                onClick={() => {
                  setMethod(m.value);
                  setFee(String(m.fee ?? cardFee(sub.amount)));
                }}
                className={clsx("chip h-10 px-4 text-sm", method === m.value ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="رسوم الدفع (د.ك)">
          <AmountInput value={fee} onChange={setFee} />
        </Field>
        {method === "card" && <p className="text-ink-2 text-xs">الفيزا / ماستر (وأبل باي على بطاقة ائتمان): 2.5% + 100 فلس. أبل باي على بطاقة كي-نت يبقى 200 فلس — اختر «كي-نت».</p>}
        <Field label="رقم فاتورة UPayments">
          <input className="field num" dir="ltr" inputMode="numeric" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="2026110142198095" />
        </Field>
        <Field label="تاريخ الإيداع بالبنك">
          <input className="field num" dir="ltr" type="date" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

type ItemValues = { kind: ItemKind; category: string; title: string; amount: number; branch_id: string | null; is_active: boolean };
const ITEM_CATEGORIES: Record<ItemKind, FinCategory[]> = {
  fixed: ["pitch_rent", "office_rent", "gov_fees", "equipment", "other"],
  salary: ["salary"],
  budget: ["marketing", "equipment", "kit", "other"],
};

function ItemModal({ item, monthName, canApply, branches, busy, onClose, onSave }: { item?: FinItem; monthName: string; canApply: boolean; branches: BranchLite[]; busy: boolean; onClose: () => void; onSave: (v: ItemValues, applyNow: boolean) => void }) {
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? "fixed");
  const [category, setCategory] = useState(item?.category ?? "pitch_rent");
  const [title, setTitle] = useState(item?.title ?? "");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [branchId, setBranchId] = useState(item?.branch_id ?? "");
  const [active, setActive] = useState(item?.is_active ?? true);
  const [applyNow, setApplyNow] = useState(canApply);
  const cats = ITEM_CATEGORIES[kind];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ kind, category: cats.includes(category as FinCategory) ? category : cats[0], title: title.trim(), amount: Number(amount) || 0, branch_id: branchId || null, is_active: active }, canApply && applyNow);
  }
  return (
    <Modal open onClose={onClose} title={item ? "تعديل البند الثابت" : "بند ثابت جديد"} footer={<Footer onClose={onClose} form="fin-item" busy={busy} />}>
      <form id="fin-item" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {!item && (
          <Field label="النوع" group className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ITEM_KIND_LABEL) as ItemKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => {
                    setKind(k);
                    setCategory(ITEM_CATEGORIES[k][0]);
                  }}
                  className={clsx("chip h-10 px-4 text-sm", kind === k ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}
                >
                  {ITEM_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </Field>
        )}
        <Field label={kind === "salary" ? "الاسم والوظيفة" : "اسم البند"} className="sm:col-span-2">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "salary" ? "مثال: أحمد — مدرب" : "مثال: إيجار المكتب"} required />
        </Field>
        <Field label="المبلغ الشهري (د.ك)">
          <AmountInput value={amount} onChange={setAmount} />
        </Field>
        {cats.length > 1 && (
          <Field label="التصنيف">
            <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="الفرع">
          <select className="field" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">عام (كل الأكاديمية)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        {item && (
          <label className="flex items-center gap-3 sm:col-span-2 cursor-pointer select-none">
            <input type="checkbox" className="h-5 w-5 accent-[var(--navy)]" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span className="font-bold text-navy text-sm">ينزل كل شهر</span>
          </label>
        )}
        {canApply && (
          <label className="flex items-center gap-3 sm:col-span-2 cursor-pointer select-none">
            <input type="checkbox" className="h-5 w-5 accent-[var(--navy)]" checked={applyNow} onChange={(e) => setApplyNow(e.target.checked)} />
            <span className="font-bold text-navy text-sm">طبّق المبلغ على {monthName} بعد</span>
          </label>
        )}
        {kind === "budget" && <p className="sm:col-span-2 text-ink-2 text-xs">الميزانية ما تنخصم من الحسبة — بس المصروف الفعلي اللي تسجله ينحسب، وتشوف كم باقي منها.</p>}
      </form>
    </Modal>
  );
}
