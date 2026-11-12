import { addMonths, format, parseISO } from "date-fns";

/** first month the finance section tracks */
export const FIN_START = "2026-11-01";
/** default UPayments KNET fee per payment (KD) */
export const KNET_FEE = 0.2;
/** subscription prices (KD) */
export const PRICE_FULL = 45;
export const PRICE_SIBLING = 40;

export type PayMethod = "knet" | "card" | "cash" | "transfer";
export const PAY_METHODS: { value: PayMethod; label: string; fee: number | null }[] = [
  { value: "knet", label: "كي-نت", fee: KNET_FEE },
  { value: "card", label: "فيزا / ماستر", fee: null }, // fee varies — typed by hand
  { value: "cash", label: "كاش", fee: 0 },
  { value: "transfer", label: "تحويل", fee: 0 },
];
export const payLabel = (m: string) => PAY_METHODS.find((x) => x.value === m)?.label ?? m;

export type FinCategory = "pitch_rent" | "office_rent" | "salary" | "substitute" | "marketing" | "gov_fees" | "kit" | "equipment" | "other" | "fees";
export const CATEGORY_LABEL: Record<FinCategory, string> = {
  pitch_rent: "إيجار الملعب",
  office_rent: "إيجار المكتب",
  salary: "الرواتب",
  substitute: "مدرب بديل",
  marketing: "التسويق",
  gov_fees: "رسوم حكومية",
  kit: "ملابس اللاعبين",
  equipment: "معدات التدريب",
  other: "أخرى",
  fees: "رسوم الدفع (UPayments)",
};
export const catLabel = (c: string) => CATEGORY_LABEL[c as FinCategory] ?? c;
/** categories offered when adding a one-off expense */
export const EXPENSE_CATEGORIES: FinCategory[] = ["marketing", "equipment", "kit", "substitute", "gov_fees", "pitch_rent", "office_rent", "other"];

export type ItemKind = "fixed" | "salary" | "budget";
export const ITEM_KIND_LABEL: Record<ItemKind, string> = { fixed: "مصروف ثابت", salary: "راتب", budget: "ميزانية" };

export type FinItem = {
  id: string;
  kind: ItemKind;
  category: string;
  title: string;
  amount: number;
  branch_id: string | null;
  staff_id: string | null;
  start_month: string;
  is_active: boolean;
  position: number;
};

export type FinEntry = {
  id: string;
  month: string;
  entry_date: string;
  kind: "fixed" | "salary" | "expense";
  category: string;
  title: string;
  amount: number;
  branch_id: string | null;
  staff_id: string | null;
  item_id: string | null;
  paid: boolean;
  paid_at: string | null;
  notes: string;
  voided_at: string | null;
  void_reason: string;
};

export type DeductionKind = "absence" | "late" | "penalty" | "other";
export const DEDUCTION_LABEL: Record<DeductionKind, string> = { absence: "غياب", late: "تأخير", penalty: "غرامة", other: "أخرى" };

export type FinDeduction = {
  id: string;
  entry_id: string;
  kind: DeductionKind;
  amount: number;
  ded_date: string;
  notes: string;
  voided_at: string | null;
  void_reason: string;
};

export type FinAudit = {
  id: number;
  at: string;
  actor_name: string;
  action: "auto" | "create" | "void" | "restore" | "amount" | "paid" | "unpaid" | "update";
  entity: "fin_items" | "fin_entries" | "fin_deductions";
  label: string;
  old_amount: number | null;
  new_amount: number | null;
  note: string;
};

/** a subscription payment as the finance page sees it */
export type FinSub = {
  id: string;
  player_id: string;
  player_name: string;
  branch_id: string | null;
  start_date: string;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  pay_method: PayMethod;
  fee: number;
};

export type MonthData = { entries: FinEntry[]; deductions: FinDeduction[]; subs: FinSub[] };

/* ---------- month helpers ---------- */
export const monthStart = (iso: string) => iso.slice(0, 7) + "-01";
export const monthEnd = (m: string) => format(addMonths(parseISO(m), 1), "yyyy-MM-01");
export const shiftMonth = (m: string, by: number) => format(addMonths(parseISO(m), by), "yyyy-MM-01");
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export const monthLabel = (m: string) => `${AR_MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const inMonth = (d: string | null | undefined, m: string) => !!d && d >= m && d < monthEnd(m);

/** KD with up to 3 decimals (fils) */
export const fmtKD = (n: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(Math.round(n * 1000) / 1000)} د.ك`;
export const num = (v: unknown) => Number(v) || 0;

/* ---------- the month in numbers ---------- */
export type Summary = {
  income: number;
  fees: number;
  expenses: number; // everything out, fees included
  net: number;
  paidCount: number;
  unpaid: FinSub[];
  unpaidTotal: number;
  byCategory: { key: string; total: number }[]; // biggest first
  salaryGross: number;
  deductionsTotal: number;
  due: number; // lines not yet paid out
  marketingSpent: number;
  incomeByBranch: { branch_id: string | null; total: number; count: number }[];
};

/** money received in a month = paid subscriptions by payment date (falls back to the start date) */
export const paidInMonth = (s: FinSub, m: string) => s.paid && inMonth(s.paid_at ?? s.start_date, m);

export function deductionsOf(entryId: string, deductions: FinDeduction[]) {
  return deductions.filter((d) => d.entry_id === entryId && !d.voided_at);
}
/** what a ledger line really costs: salaries net of deductions, never below zero */
export function entryNet(e: FinEntry, deductions: FinDeduction[]) {
  if (e.kind !== "salary") return e.amount;
  const ded = deductionsOf(e.id, deductions).reduce((a, d) => a + d.amount, 0);
  return Math.max(0, e.amount - ded);
}

export function summarize(data: MonthData, month: string): Summary {
  const paid = data.subs.filter((s) => paidInMonth(s, month));
  const unpaid = data.subs.filter((s) => !s.paid && inMonth(s.start_date, month));
  const income = paid.reduce((a, s) => a + s.amount, 0);
  const fees = paid.reduce((a, s) => a + s.fee, 0);

  const live = data.entries.filter((e) => !e.voided_at);
  const cat = new Map<string, number>();
  let due = 0;
  let salaryGross = 0;
  let deductionsTotal = 0;
  for (const e of live) {
    const net = entryNet(e, data.deductions);
    cat.set(e.category, (cat.get(e.category) ?? 0) + net);
    if (!e.paid) due += net;
    if (e.kind === "salary") {
      salaryGross += e.amount;
      deductionsTotal += e.amount - net;
    }
  }
  if (fees > 0) cat.set("fees", fees);
  const byCategory = [...cat.entries()].map(([key, total]) => ({ key, total })).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const expenses = byCategory.reduce((a, c) => a + c.total, 0);

  const br = new Map<string | null, { total: number; count: number }>();
  for (const s of paid) {
    const cur = br.get(s.branch_id) ?? { total: 0, count: 0 };
    br.set(s.branch_id, { total: cur.total + s.amount, count: cur.count + 1 });
  }

  return {
    income,
    fees,
    expenses,
    net: income - expenses,
    paidCount: paid.length,
    unpaid,
    unpaidTotal: unpaid.reduce((a, s) => a + s.amount, 0),
    byCategory,
    salaryGross,
    deductionsTotal,
    due,
    marketingSpent: cat.get("marketing") ?? 0,
    incomeByBranch: [...br.entries()].map(([branch_id, v]) => ({ branch_id, ...v })).sort((a, b) => b.total - a.total),
  };
}
