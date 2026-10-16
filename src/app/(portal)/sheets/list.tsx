"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import { CalendarDays, Clock, FileText, Layers, Plus, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, KIND_LABEL, normalizeDrills, totalMinutes, type DrillSheet } from "@/lib/sheets";
import type { StaffName } from "@/lib/types";
import { bidi } from "@/lib/bidi";

type Tab = "all" | "mine";

export default function SheetList({ me, initialSheets, staff }: { me: { id: string; canDelete: boolean }; initialSheets: DrillSheet[]; staff: StaffName[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [sheets, setSheets] = useState(initialSheets);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    const ch = supabase
      .channel("drill-sheets-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "drill_sheets" }, (p) => {
        if (p.eventType === "DELETE") setSheets((a) => a.filter((s) => s.id !== (p.old as DrillSheet).id));
        else {
          const row = p.new as DrillSheet;
          setSheets((a) => [row, ...a.filter((s) => s.id !== row.id)]);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase]);

  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.full_name ?? "";
  const list = tab === "mine" ? sheets.filter((s) => s.author_id === me.id) : sheets;
  const needle = q.trim();
  const shown = list.filter((s) => !needle || s.title.includes(needle) || normalizeDrills(s.drills).some((d) => d.title.includes(needle) || d.code.includes(needle)));

  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 max-w-7xl">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="display text-navy text-[26px] sm:text-[36px] leading-none">أوراق التمارين</h1>
          <p className="text-ink-2 text-sm mt-1.5">ارفع رسم التمرين، اكتب الشرح والأهداف والنقاط الفنية، واطبع ورقة A4 جاهزة للمدربين.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/sheets/new?kind=session" className="btn-outline h-11 px-4 hidden sm:inline-flex">
            <Layers size={18} /> <span>حصة كاملة</span>
          </Link>
          <Link href="/sheets/new" className="btn-primary h-11 px-4">
            <Plus size={18} /> <span>إنشاء ورقة تمرين</span>
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="flex gap-1.5">
          {(["all", "mine"] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={clsx("h-10 px-3.5 rounded-xl inline-flex items-center gap-2 text-[14px] font-bold shrink-0 transition-colors", tab === t ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
              {t === "all" ? "كل الأوراق" : "أوراقي"}
              <span className={clsx("num text-[12px] min-w-5 h-5 px-1.5 rounded-full grid place-items-center", tab === t ? "bg-white/15" : "bg-silver-100 text-ink-2")}>{t === "all" ? sheets.length : sheets.filter((s) => s.author_id === me.id).length}</span>
            </button>
          ))}
        </div>
        <label className="field h-11 flex items-center gap-2 py-0 sm:max-w-xs">
          <Search size={16} className="text-ink-2 shrink-0" />
          <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="بحث باسم الورقة أو التمرين" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button type="button" onClick={() => setQ("")} className="text-ink-2" aria-label="مسح">
              <X size={15} />
            </button>
          )}
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-silver bg-white/60 p-10 text-center">
          <div className="text-navy font-extrabold text-[17px]">{tab === "mine" ? "ما عندك أوراق بعد" : "ما في أوراق بعد"}</div>
          <p className="text-ink-2 text-sm mt-1">أنشئ ورقة لتمرين واحد، أو حصة كاملة من عدة تمارين.</p>
          <Link href="/sheets/new" className="btn-primary h-11 px-4 mt-4 inline-flex">
            <Plus size={18} /> إنشاء ورقة تمرين
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((s) => (
            <SheetCard key={s.id} s={s} author={nameOf(s.author_id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SheetCard({ s, author }: { s: DrillSheet; author: string }) {
  const drills = normalizeDrills(s.drills);
  const cover = drills.find((d) => d.img)?.img;
  const mins = totalMinutes(drills);
  return (
    <Link href={`/sheets/${s.id}`} className="card group overflow-hidden flex flex-col hover:border-ice transition">
      <div className="relative aspect-[16/11] bg-[#d9e4ef] overflow-hidden grid place-items-center">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="absolute inset-0 w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <FileText size={40} className="text-navy/30" />
        )}
        <span className={clsx("absolute top-2 right-2 chip text-[11px]", s.kind === "session" ? "bg-gold text-navy-900" : "bg-navy-900/85 text-white")}>
          {s.kind === "session" ? <Layers size={12} /> : <FileText size={12} />}
          {KIND_LABEL[s.kind]}
          {s.kind === "session" && <span className="num">· {drills.length}</span>}
        </span>
      </div>
      <div className="p-3.5 flex-1 flex flex-col gap-1.5">
        <div className="font-extrabold text-navy text-[15.5px] leading-snug line-clamp-2">{s.title || "بدون اسم"}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
          {s.kind === "drill" && drills[0].cat && <span className="chip bg-navy-50 text-navy text-[11px]">{drills[0].cat}</span>}
          {mins ? (
            <span className="inline-flex items-center gap-1">
              <Clock size={13} /> <span className="num">{mins}</span> د
            </span>
          ) : null}
          {s.age_group && <span className="num">{bidi(`فئة ${s.age_group}`)}</span>}
          {s.session_date && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={13} /> <span className="num">{fmtDate(s.session_date)}</span>
            </span>
          )}
        </div>
        <div className="mt-auto pt-1.5 text-[11.5px] text-ink-2 flex items-center justify-between gap-2">
          <span className="truncate">{author}</span>
          <span className="shrink-0">{ago(s.updated_at)}</span>
        </div>
      </div>
    </Link>
  );
}

function ago(iso: string) {
  try {
    return formatDistanceToNowStrict(parseISO(iso), { locale: ar, addSuffix: true });
  } catch {
    return "";
  }
}
