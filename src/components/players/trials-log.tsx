"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronLeft, Phone, MessageCircle, RefreshCw, CalendarClock, UserCheck, UserX, Hourglass, CreditCard, Search } from "lucide-react";
import { addMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui";
import { fetchAll } from "@/lib/fetch-all";
import { DAY_SHORT, fmtDate, telLink, waLink, type Group, type TrialOutcome } from "@/lib/players";
import { bidi } from "@/lib/bidi";

type Row = {
  id: string;
  full_name: string;
  age: number | null;
  group_id: string | null;
  branch_id: string | null;
  guardian_name: string;
  guardian_phone: string;
  source: string;
  kind: "subscriber" | "trial";
  trial_date: string;
  converted_at: string | null;
  trial_outcome: TrialOutcome | null;
  trial_outcome_reason: string;
  trial_outcome_at: string | null;
};

/** one status per trial — same rules as the analytics page so numbers match everywhere */
type Status = "subscribed" | "registered" | "not_registered" | "pending" | "upcoming";

function statusOf(r: Row, today: string): Status {
  if (r.converted_at || r.kind === "subscriber") return "subscribed";
  if (r.trial_outcome === "registered") return "registered";
  if (r.trial_outcome === "not_registered") return "not_registered";
  return r.trial_date > today ? "upcoming" : "pending";
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  subscribed: { label: "سجّل ودفع", cls: "bg-[#1a8f5f] text-white" },
  registered: { label: "سجّل — بانتظار الاشتراك", cls: "bg-[#1a8f5f]/15 text-[#13704a]" },
  not_registered: { label: "لم يسجّل", cls: "bg-error-100 text-error" },
  pending: { label: "بانتظار القرار", cls: "bg-gold-100 text-navy-900" },
  upcoming: { label: "تجربة قادمة", cls: "bg-ice-100 text-navy" },
};

const PERIODS = [
  { months: 1, label: "شهر" },
  { months: 3, label: "٣ شهور" },
  { months: 6, label: "٦ شهور" },
  { months: 12, label: "سنة" },
];

type Filter = "all" | "yes" | "no" | "waiting";

export default function TrialsLog({ open, onClose, today, groups }: { open: boolean; onClose: () => void; today: string; groups: Group[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [attended, setAttended] = useState<Record<string, number>>({});
  const [error, setError] = useState(false);
  const [months, setMonths] = useState(1);
  const [anchor, setAnchor] = useState(today.slice(0, 7)); // last month of the window (yyyy-MM)
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [reload, setReload] = useState(0);

  // always read fresh from the database when opened (includes archived / not-registered trials)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const list = await fetchAll<Row>((a, b) =>
        supabase
          .from("players")
          .select("id, full_name, age, group_id, branch_id, guardian_name, guardian_phone, source, kind, trial_date, converted_at, trial_outcome, trial_outcome_reason, trial_outcome_at")
          .not("trial_date", "is", null)
          .order("id")
          .range(a, b),
      );
      const clean = list.filter((r) => r.trial_outcome !== "removed"); // removed = data-entry mistakes, never counted
      const ids = clean.map((r) => r.id);
      const counts: Record<string, number> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const att = await fetchAll<{ player_id: string; status: string }>((a, b) => supabase.from("attendance").select("player_id, status").in("player_id", chunk).order("id").range(a, b));
        for (const x of att) if (x.status === "present" || x.status === "late") counts[x.player_id] = (counts[x.player_id] ?? 0) + 1;
      }
      if (!alive) return;
      setError(false);
      setRows(clean);
      setAttended(counts);
    })().catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [open, reload, supabase]);

  const from = format(startOfMonth(addMonths(parseISO(anchor + "-01"), -(months - 1))), "yyyy-MM-dd");
  const to = format(endOfMonth(parseISO(anchor + "-01")), "yyyy-MM-dd");
  const rangeLabel =
    months === 1 ? format(parseISO(from), "MMMM yyyy", { locale: ar }) : `${format(parseISO(from), "MMMM yyyy", { locale: ar })} – ${format(parseISO(to), "MMMM yyyy", { locale: ar })}`;
  const atLatest = anchor >= format(addMonths(parseISO(today), 1), "yyyy-MM");

  const inRange = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => r.trial_date >= from && r.trial_date <= to)
        .map((r) => ({ r, s: statusOf(r, today) }))
        .sort((a, b) => b.r.trial_date.localeCompare(a.r.trial_date) || a.r.full_name.localeCompare(b.r.full_name, "ar")),
    [rows, from, to, today],
  );

  const n = {
    total: inRange.length,
    yes: inRange.filter((x) => x.s === "subscribed" || x.s === "registered").length,
    no: inRange.filter((x) => x.s === "not_registered").length,
    waiting: inRange.filter((x) => x.s === "pending" || x.s === "upcoming").length,
    pending: inRange.filter((x) => x.s === "pending").length,
  };
  const decided = n.yes + n.no;
  const rate = decided ? Math.round((n.yes / decided) * 100) : null;

  const shown = inRange.filter(({ r, s }) => {
    if (filter === "yes" && !(s === "subscribed" || s === "registered")) return false;
    if (filter === "no" && s !== "not_registered") return false;
    if (filter === "waiting" && !(s === "pending" || s === "upcoming")) return false;
    const t = q.trim();
    const digits = t.replace(/\D/g, "");
    return !t || r.full_name.includes(t) || (digits.length >= 3 && r.guardian_phone.replace(/\D/g, "").includes(digits));
  });

  const shift = (dir: 1 | -1) => setAnchor(format(addMonths(parseISO(anchor + "-01"), dir * months), "yyyy-MM"));

  return (
    <Modal open={open} onClose={onClose} title="سجل التجارب" wide>
      {/* period */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 rounded-xl bg-silver-100 p-1">
          {PERIODS.map((p) => (
            <button key={p.months} onClick={() => setMonths(p.months)} className={clsx("h-9 px-3 rounded-lg text-[13px] font-extrabold transition", months === p.months ? "bg-navy text-white shadow" : "text-navy")}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ms-auto">
          <button onClick={() => shift(-1)} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-navy-50 text-navy" aria-label="الفترة السابقة">
            <ChevronRight size={18} />
          </button>
          <span className="text-navy font-extrabold text-[13.5px] min-w-[120px] text-center">{rangeLabel}</span>
          <button onClick={() => shift(1)} disabled={atLatest} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-navy-50 text-navy disabled:opacity-30" aria-label="الفترة التالية">
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      {/* summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Tile n={n.total} label="تجارب" active={filter === "all"} onClick={() => setFilter("all")} cls="text-navy" />
        <Tile n={n.yes} label="سجّلوا" active={filter === "yes"} onClick={() => setFilter("yes")} cls="text-[#1a8f5f]" />
        <Tile n={n.no} label="لم يسجّلوا" active={filter === "no"} onClick={() => setFilter("no")} cls="text-error" />
        <Tile n={n.waiting} label="بانتظار / قادمة" active={filter === "waiting"} onClick={() => setFilter("waiting")} cls="text-gold" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2 mb-3">
        <span>
          نسبة التحويل: <b className="num text-navy">{rate === null ? "—" : `${rate}%`}</b> {decided > 0 && <span className="num">({n.yes} من {decided} محسومة)</span>}
        </span>
        {n.pending > 0 && <span className="text-gold font-bold">⚠ {n.pending} تجربة بدون نتيجة — سجّل نتيجتها عشان الأرقام تكون دقيقة</span>}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <label className="field flex items-center gap-2 h-10 flex-1">
          <Search size={15} className="text-ink-2 shrink-0" />
          <input className="bg-transparent outline-none flex-1 min-w-0" value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم" />
        </label>
        <button onClick={() => setReload((x) => x + 1)} className="btn-ghost h-10 w-10 p-0 grid place-items-center" aria-label="تحديث" title="تحديث">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* list */}
      {error ? (
        <div className="card p-6 text-center text-error font-bold">تعذر تحميل البيانات — تحقق من الاتصال واضغط تحديث.</div>
      ) : rows === null ? (
        <div className="card p-6 text-center text-ink-2">جاري التحميل…</div>
      ) : shown.length === 0 ? (
        <div className="card p-6 text-center text-ink-2">ما في تجارب بهالفترة{filter !== "all" || q ? " بهالفلتر" : ""}.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map(({ r, s }) => {
            const g = groups.find((x) => x.id === r.group_id);
            const att = attended[r.id] ?? 0;
            const past = r.trial_date <= today;
            return (
              <li key={r.id} className="rounded-2xl border border-silver-200 bg-white px-3.5 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-navy text-[15.5px]">{r.full_name}</span>
                      <span className={clsx("chip px-2 text-[11px]", STATUS[s].cls)}>{STATUS[s].label}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[12px] text-ink-2">
                      <span className="flex items-center gap-1">
                        <CalendarClock size={13} /> {DAY_SHORT[parseISO(r.trial_date).getDay()]} <span className="num">{fmtDate(r.trial_date)}</span>
                      </span>
                      {r.age && <span className="num">{r.age} سنوات</span>}
                      {g && <span>{bidi(g.name)}</span>}
                      {r.source && <span>المصدر: {r.source}</span>}
                      {past && (att > 0 ? <span className="text-ice-600 font-bold">حضر {att} {att === 1 ? "حصة" : "حصص"}</span> : <span className="text-error font-bold">ما انسجل له حضور</span>)}
                    </div>
                    {s === "not_registered" && r.trial_outcome_reason && <div className="mt-1.5 text-[12px] text-error/90">السبب: {r.trial_outcome_reason}</div>}
                    {s === "subscribed" && r.converted_at && <div className="mt-1.5 text-[12px] text-[#13704a]">اشترك من {fmtDate(r.converted_at)}</div>}
                    {s === "registered" && (
                      <Link href="/players" className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-bold text-[#13704a] underline">
                        <CreditCard size={12} /> أضف اشتراكه من سجل اللاعبين
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.guardian_phone ? (
                      <>
                        <a href={telLink(r.guardian_phone)} className="h-10 w-10 grid place-items-center rounded-xl bg-navy text-white" aria-label={`اتصال بولي أمر ${r.full_name}`} title={r.guardian_phone}>
                          <Phone size={16} />
                        </a>
                        <a href={waLink(r.guardian_phone)} target="_blank" rel="noreferrer" className="h-10 w-10 grid place-items-center rounded-xl border border-silver-200 text-[#1a8f5f]" aria-label="واتساب" title="واتساب">
                          <MessageCircle size={16} />
                        </a>
                      </>
                    ) : (
                      <span className="text-[11px] text-error font-bold max-w-[70px] text-center leading-tight">بدون رقم</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11.5px] text-ink-2 flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1">
          <UserCheck size={12} /> سجّل = اشترك أو انعلّم «سجّل»
        </span>
        <span className="flex items-center gap-1">
          <UserX size={12} /> المحذوفين بالغلط ما ينحسبون
        </span>
        <span className="flex items-center gap-1">
          <Hourglass size={12} /> الفترة حسب تاريخ التجربة
        </span>
      </p>
    </Modal>
  );
}

function Tile({ n, label, cls, active, onClick }: { n: number; label: string; cls: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={clsx("rounded-xl border-2 px-3 py-2 text-start transition", active ? "border-navy bg-navy-50" : "border-silver-200 bg-white")}>
      <span className={clsx("block num text-[24px] font-bold leading-none", cls)}>{n}</span>
      <span className="block text-ink-2 text-[12px] font-bold mt-1">{label}</span>
    </button>
  );
}
