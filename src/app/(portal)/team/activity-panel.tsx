"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, BellRing, ChevronDown } from "lucide-react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { Avatar } from "@/components/ui";
import { ago } from "@/lib/notifications";
import { ROLE_LABELS, type StaffRole } from "@/lib/types";

export type DayRow = { user_id: string; day: string; first_seen: string; last_seen: string; hits: number; last_path: string | null };
export type Person = { id: string; full_name: string; role: StaffRole; is_active: boolean; created_at: string };

/** the day activity tracking went live */
const TRACKING_START = "2026-10-22";

const PAGE_NAMES: [string, string][] = [
  ["/attendance", "الحضور"],
  ["/players", "اللاعبين"],
  ["/drills", "مكتبة التمارين"],
  ["/sheets", "أوراق التمارين"],
  ["/calendar", "التقويم"],
  ["/development", "تطوير اللاعبين"],
  ["/resources", "المصادر"],
  ["/marketing", "مركز التسويق"],
  ["/notifications", "التنبيهات"],
  ["/settings", "الإعدادات"],
];
const pageName = (p: string | null) => (!p ? "" : p === "/" ? "الرئيسية" : (PAGE_NAMES.find(([k]) => p.startsWith(k))?.[1] ?? ""));

type Status = { tone: "good" | "warn" | "bad" | "none"; label: string };
function statusOf(lastSeen: string | null, today: string): Status {
  if (!lastSeen) return { tone: "none", label: "ما دخل أبداً" };
  const days = differenceInCalendarDays(parseISO(today), parseISO(lastSeen.slice(0, 10)));
  if (days <= 1) return { tone: "good", label: "نشط" };
  if (days <= 4) return { tone: "warn", label: `غايب ${days} أيام` };
  return { tone: "bad", label: `غايب ${days} يوم` };
}
const TONE = {
  good: "bg-[#1a8f5f]",
  warn: "bg-gold",
  bad: "bg-error",
  none: "bg-silver",
};

export default function ActivityPanel({ people, days, signIns, today }: { people: Person[]; days: DayRow[]; signIns: Record<string, string | null>; today: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const strip = Array.from({ length: 14 }, (_, i) => format(addDays(parseISO(today), i - 13), "yyyy-MM-dd"));

  const rows = people
    .filter((p) => p.is_active)
    .map((p) => {
      const mine = days.filter((d) => d.user_id === p.id).sort((a, b) => b.day.localeCompare(a.day));
      const last = mine[0] ?? null;
      const byDay = new Map(mine.map((d) => [d.day, d]));
      const active7 = mine.filter((d) => differenceInCalendarDays(parseISO(today), parseISO(d.day)) < 7).length;
      const active30 = mine.filter((d) => differenceInCalendarDays(parseISO(today), parseISO(d.day)) < 30).length;
      const lastSeen = last?.last_seen ?? null;
      return { p, mine, last, byDay, active7, active30, lastSeen, status: statusOf(lastSeen, today) };
    })
    .sort((a, b) => (a.lastSeen ?? "").localeCompare(b.lastSeen ?? "")); // the most absent first

  const absent = rows.filter((r) => r.status.tone === "bad" || r.status.tone === "none").length;

  return (
    <section className="card p-4 sm:p-5 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <Activity size={19} className="text-ice-600" />
        <h2 className="text-navy font-extrabold text-[17px]">نشاط الفريق على المنصة</h2>
        {absent > 0 && <span className="chip bg-error-100 text-error text-[12px] ms-auto">{absent} غايب أكثر من ٤ أيام</span>}
      </div>
      <p className="text-ink-2 text-[12.5px] mb-4">تشوفه أنت بس — الموظفين ما يدرون ولا يظهر لهم شي. الأكثر غياباً بالأعلى.</p>

      <div className="flex flex-col divide-y divide-silver-200">
        {rows.map(({ p, mine, last, byDay, active7, active30, lastSeen, status }) => {
          const isOpen = open === p.id;
          return (
            <div key={p.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="relative">
                  <Avatar name={p.full_name} size={38} tone="light" />
                  <span className={clsx("absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white", TONE[status.tone])} />
                </span>
                <button onClick={() => setOpen(isOpen ? null : p.id)} className="min-w-0 flex-1 text-start" aria-expanded={isOpen}>
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-navy text-[15px] truncate">{p.full_name}</span>
                    <span className="text-ink-2 text-[11.5px]">{ROLE_LABELS[p.role]}</span>
                    <ChevronDown size={14} className={clsx("text-ink-2 transition", isOpen && "rotate-180")} />
                  </span>
                  <span className="block text-[12.5px] text-ink-2">
                    {lastSeen ? (
                      <>
                        آخر نشاط <b className="text-navy">{ago(lastSeen)}</b>
                        {last?.last_path && pageName(last.last_path) ? ` · في ${pageName(last.last_path)}` : ""}
                      </>
                    ) : (
                      "ما استخدم المنصة من بدأنا المتابعة"
                    )}
                  </span>
                </button>

                <Link href={`/notifications?to=${p.id}`} className="h-9 w-9 grid place-items-center rounded-lg text-ink-2 hover:bg-gold/20 hover:text-navy shrink-0 sm:order-last" title={`أرسل تذكير لـ ${p.full_name}`} aria-label={`أرسل تذكير لـ ${p.full_name}`}>
                  <BellRing size={17} />
                </Link>

                <div className="w-full sm:w-auto flex items-center gap-3">
                {/* 14-day strip */}
                <div className="flex gap-[3px] flex-1 sm:flex-none" aria-label="آخر ١٤ يوم">
                  {strip.map((d) => {
                    const r = byDay.get(d);
                    const lvl = !r ? 0 : r.hits >= 12 ? 3 : r.hits >= 4 ? 2 : 1;
                    return (
                      <span
                        key={d}
                        title={`${format(parseISO(d), "EEEE d MMMM", { locale: ar })}: ${r ? `${r.hits} صفحة` : "ما دخل"}`}
                        className={clsx("h-5 flex-1 sm:flex-none sm:w-3.5 rounded-[3px]", lvl === 0 ? "bg-silver-100 border border-silver-200" : lvl === 1 ? "bg-ice/40" : lvl === 2 ? "bg-ice" : "bg-ice-600")}
                      />
                    );
                  })}
                </div>

                <div className="text-center w-16 shrink-0">
                  <div className="num text-navy font-extrabold text-[17px] leading-none">{active7}/7</div>
                  <div className="text-ink-2 text-[10.5px]">أيام الأسبوع</div>
                </div>
                <span className={clsx("chip text-[11.5px] shrink-0 w-[82px] justify-center", status.tone === "good" ? "bg-[#1a8f5f]/10 text-[#1a8f5f]" : status.tone === "warn" ? "bg-gold/20 text-[#8a6a00]" : status.tone === "bad" ? "bg-error-100 text-error" : "bg-silver-100 text-ink-2")}>{status.label}</span>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 sm:ms-[50px] grid gap-2 sm:grid-cols-3 text-[13px] fade-up">
                  <Fact label="أيام نشاط آخر ٣٠ يوم" value={`${active30} يوم`} />
                  <Fact label="آخر تسجيل دخول بكلمة المرور" value={signIns[p.id] ? format(new Date(signIns[p.id]!), "d MMMM · h:mm a", { locale: ar }) : "—"} />
                  <Fact label="متوسط الصفحات باليوم" value={mine.length ? String(Math.round(mine.reduce((t, d) => t + d.hits, 0) / mine.length)) : "—"} />
                  {mine.length > 0 && (
                    <div className="sm:col-span-3 rounded-lg bg-silver-100/70 p-2.5">
                      <div className="text-ink-2 text-[12px] font-bold mb-1.5">آخر الأيام</div>
                      <ul className="flex flex-col gap-1">
                        {mine.slice(0, 7).map((d) => (
                          <li key={d.day} className="flex flex-wrap gap-x-3 text-navy">
                            <span className="font-bold w-32">{format(parseISO(d.day), "EEEE d/M", { locale: ar })}</span>
                            <span className="num text-ink-2" dir="ltr">
                              {format(new Date(d.first_seen), "h:mm a")} – {format(new Date(d.last_seen), "h:mm a")}
                            </span>
                            <span className="text-ink-2">
                              <span className="num">{d.hits}</span> صفحة
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-ink-2 text-[11.5px] mt-3">
        المتابعة بدأت من {format(parseISO(TRACKING_START), "d MMMM yyyy", { locale: ar })} — الأيام قبلها تظهر فاضية. المربعات: كل مربع يوم، وكل ما غمق اللون زاد استخدامه.
      </p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-silver-100/70 p-2.5">
      <div className="text-ink-2 text-[11.5px] font-bold">{label}</div>
      <div className="text-navy font-bold">{value}</div>
    </div>
  );
}
