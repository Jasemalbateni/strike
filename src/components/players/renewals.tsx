"use client";

/* معدل التجديد — computed from the whole subscription history (nothing is ever deleted),
 * grouped by month / quarter / half-year / year of the subscription's end date. */

import { useMemo, useState } from "react";
import clsx from "clsx";
import { addDays, format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import { RefreshCw } from "lucide-react";
import type { Player, Subscription } from "@/lib/players";

type Grain = "month" | "quarter" | "half" | "year";
const GRAINS: { v: Grain; label: string }[] = [
  { v: "month", label: "شهري" },
  { v: "quarter", label: "ربع سنوي" },
  { v: "half", label: "نصف سنوي" },
  { v: "year", label: "سنوي" },
];

/** days after the end date in which a new subscription still counts as a renewal */
const GRACE_DAYS = 14;

type Bucket = { key: string; label: string; ended: number; renewed: number; lost: number; pending: number; revenue: number };

function bucketOf(dateISO: string, grain: Grain): { key: string; label: string } {
  const d = parseISO(dateISO);
  const y = d.getFullYear();
  const m = d.getMonth(); // 0–11
  if (grain === "month") return { key: `${y}-${String(m + 1).padStart(2, "0")}`, label: format(d, "MMMM yyyy", { locale: ar }) };
  if (grain === "quarter") {
    const q = Math.floor(m / 3) + 1;
    return { key: `${y}-Q${q}`, label: `الربع ${q} · ${y}` };
  }
  if (grain === "half") {
    const h = m < 6 ? 1 : 2;
    return { key: `${y}-H${h}`, label: `${h === 1 ? "النصف الأول" : "النصف الثاني"} · ${y}` };
  }
  return { key: `${y}`, label: `سنة ${y}` };
}

export function computeRenewals(players: Player[], subs: Subscription[], today: string, grain: Grain): Bucket[] {
  const byPlayer = new Map<string, Subscription[]>();
  for (const s of subs) {
    if (!byPlayer.has(s.player_id)) byPlayer.set(s.player_id, []);
    byPlayer.get(s.player_id)!.push(s);
  }
  const archived = new Map(players.map((p) => [p.id, p.archived]));
  const buckets = new Map<string, Bucket>();
  for (const [pid, list] of byPlayer) {
    if (!archived.has(pid)) continue;
    const sorted = [...list].sort((a, b) => a.start_date.localeCompare(b.start_date));
    sorted.forEach((s, i) => {
      // only subscriptions that have ended are "decisions"
      if (s.end_date > today) return;
      const graceEnd = format(addDays(parseISO(s.end_date), GRACE_DAYS), "yyyy-MM-dd");
      const next = sorted.slice(i + 1).find((n) => n.start_date <= graceEnd);
      const { key, label } = bucketOf(s.end_date, grain);
      const b = buckets.get(key) ?? { key, label, ended: 0, renewed: 0, lost: 0, pending: 0, revenue: 0 };
      b.ended++;
      if (next && next.paid) {
        b.renewed++;
        b.revenue += Number(next.amount) || 0;
      } else if (archived.get(pid)) b.lost++; // archived = decided not to continue
      else if (next || graceEnd >= today) b.pending++; // unpaid renewal, or still inside the grace window
      else b.lost++;
      buckets.set(key, b);
    });
  }
  return [...buckets.values()].sort((a, b) => b.key.localeCompare(a.key));
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
const fmtKD = (n: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} د.ك`;

export default function RenewalPanel({ players, subs, today, className }: { players: Player[]; subs: Subscription[]; today: string; className?: string }) {
  const [grain, setGrain] = useState<Grain>("month");
  const rows = useMemo(() => computeRenewals(players, subs, today, grain), [players, subs, today, grain]);
  const cur = rows[0];
  const prev = rows[1];
  const curRate = cur ? pct(cur.renewed, cur.renewed + cur.lost) : null;
  const prevRate = prev ? pct(prev.renewed, prev.renewed + prev.lost) : null;
  const delta = curRate !== null && prevRate !== null ? curRate - prevRate : null;

  return (
    <div className={clsx("card p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-navy font-extrabold text-[16px] flex items-center gap-2 whitespace-nowrap">
          <RefreshCw size={18} className="text-ice-600" /> معدل التجديد
        </h2>
        <div className="flex gap-1">
          {GRAINS.map((g) => (
            <button key={g.v} type="button" onClick={() => setGrain(g.v)} className={clsx("chip px-2.5 h-8 text-[12px] whitespace-nowrap", grain === g.v ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {!cur ? (
        <div className="rounded-xl border border-dashed border-silver p-4 text-center text-ink-2 text-[13px]">ما انتهى أي اشتراك بعد — أول نسبة تجديد تظهر هنا بعد أول دورة.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="rounded-xl bg-navy text-white p-3">
              <div className="text-[11.5px] text-silver">{cur.label}</div>
              <div className="num text-[28px] font-bold leading-none mt-1">{curRate === null ? "—" : `${curRate}%`}</div>
              <div className="text-[11.5px] mt-1.5 text-silver">
                {delta === null ? "أول فترة قياس" : delta === 0 ? "مثل الفترة السابقة" : (
                  <span className={delta > 0 ? "text-ice" : "text-[#ff9b9b]"}>
                    {delta > 0 ? "▲" : "▼"} <span className="num">{Math.abs(delta)}</span> نقطة عن {prev!.label}
                  </span>
                )}
              </div>
            </div>
            <Tile n={cur.renewed} label="جدّدوا" tone="ice" sub={cur.revenue ? fmtKD(cur.revenue) : undefined} />
            <Tile n={cur.lost} label="لم يجددوا" tone="error" />
            <Tile n={cur.pending} label="قيد الانتظار" tone="gold" sub={`مهلة ${GRACE_DAYS} يوم`} />
          </div>

          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full text-[13px] min-w-[520px]">
              <thead>
                <tr className="text-ink-2 text-[12px]">
                  <th className="text-start font-bold py-1.5">الفترة</th>
                  <th className="text-center font-bold py-1.5">انتهى</th>
                  <th className="text-center font-bold py-1.5">جدّد</th>
                  <th className="text-center font-bold py-1.5">لم يجدد</th>
                  <th className="text-center font-bold py-1.5">انتظار</th>
                  <th className="text-center font-bold py-1.5">النسبة</th>
                  <th className="text-end font-bold py-1.5">إيراد التجديد</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const rate = pct(r.renewed, r.renewed + r.lost);
                  const p = rows[i + 1];
                  const pr = p ? pct(p.renewed, p.renewed + p.lost) : null;
                  const d = rate !== null && pr !== null ? rate - pr : null;
                  return (
                    <tr key={r.key} className="border-t border-silver-200">
                      <td className="py-2 font-bold text-navy">{r.label}</td>
                      <td className="py-2 text-center num">{r.ended}</td>
                      <td className="py-2 text-center num text-navy font-bold">{r.renewed}</td>
                      <td className="py-2 text-center num text-error">{r.lost}</td>
                      <td className="py-2 text-center num text-ink-2">{r.pending || "—"}</td>
                      <td className="py-2 text-center">
                        <span className={clsx("chip num", rate === null ? "bg-silver-100 text-ink-2" : rate >= 70 ? "bg-ice-100 text-navy" : rate >= 50 ? "bg-gold-100 text-navy-900" : "bg-error-100 text-error")}>{rate === null ? "—" : `${rate}%`}</span>
                        {d !== null && d !== 0 && <span className={clsx("num text-[11px] ms-1", d > 0 ? "text-ice-600" : "text-error")}>{d > 0 ? "+" : ""}{d}</span>}
                      </td>
                      <td className="py-2 text-end num">{r.revenue ? fmtKD(r.revenue) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-ink-2 text-[11px] mt-3">يُحتسب التجديد إذا بدأ اشتراك جديد مدفوع خلال {GRACE_DAYS} يوماً من انتهاء السابق؛ المؤرشف يُحتسب "لم يجدد" فوراً. الفترة = شهر انتهاء الاشتراك السابق. السجل كامل ولا يُحذف، فالمقارنة الشهرية والربعية والسنوية تتراكم تلقائياً.</p>
        </>
      )}
    </div>
  );
}

function Tile({ n, label, tone, sub }: { n: number; label: string; tone: "ice" | "error" | "gold"; sub?: string }) {
  const cls = { ice: "bg-ice-50 text-navy", error: "bg-error-100/60 text-error", gold: "bg-gold-100/60 text-navy-900" }[tone];
  return (
    <div className={clsx("rounded-xl p-3", cls)}>
      <div className="text-[11.5px] opacity-80">{label}</div>
      <div className="num text-[28px] font-bold leading-none mt-1">{n}</div>
      {sub && <div className="num text-[11.5px] mt-1.5 opacity-80">{sub}</div>}
    </div>
  );
}
