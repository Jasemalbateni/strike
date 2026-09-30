"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import { BookOpen, Clock, FilePen, Hourglass, Plus, Search, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BoardStatic } from "@/components/drills/render";
import { parseBoard } from "@/lib/drills/board";
import { CATEGORIES, STATUS_CHIP, STATUS_LABEL, type Drill } from "@/lib/drills/meta";
import type { StaffName } from "@/lib/types";
import { bidi } from "@/lib/bidi";

type Tab = "library" | "pending" | "mine";

export default function DrillLibrary({ me, initialDrills, staff, initialTab }: { me: { id: string; canApprove: boolean }; initialDrills: Drill[]; staff: StaffName[]; initialTab?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [drills, setDrills] = useState(initialDrills);
  const [tab, setTab] = useState<Tab>(initialTab === "pending" || initialTab === "mine" ? initialTab : "library");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  useEffect(() => {
    const ch = supabase
      .channel("drills-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "drills" }, (p) => {
        if (p.eventType === "DELETE") setDrills((a) => a.filter((d) => d.id !== (p.old as Drill).id));
        else {
          const row = p.new as Drill;
          setDrills((a) => [row, ...a.filter((d) => d.id !== row.id)]);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase]);

  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.full_name ?? "";
  const library = drills.filter((d) => d.status === "approved");
  const pending = drills.filter((d) => d.status === "pending" && (me.canApprove || d.author_id === me.id));
  const mine = drills.filter((d) => d.author_id === me.id && (d.status === "draft" || d.status === "returned"));
  const list = tab === "library" ? library : tab === "pending" ? pending : mine;
  const needle = q.trim();
  const shown = list.filter((d) => (!cat || d.category === cat) && (!needle || d.title.includes(needle) || d.category.includes(needle)));
  const cats = CATEGORIES.filter((c) => list.some((d) => d.category === c));

  const tabs: { v: Tab; label: string; icon: React.ReactNode; n: number }[] = [
    { v: "library", label: "المكتبة", icon: <BookOpen size={16} />, n: library.length },
    { v: "pending", label: me.canApprove ? "بانتظار اعتمادك" : "بانتظار الاعتماد", icon: <Hourglass size={16} />, n: pending.length },
    { v: "mine", label: "مسوداتي", icon: <FilePen size={16} />, n: mine.length },
  ];

  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 max-w-7xl">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="display text-navy text-[26px] sm:text-[36px] leading-none">التمارين</h1>
          <p className="text-ink-2 text-sm mt-1.5">ارسم التمرين، أرسله للاعتماد، ويصير في مكتبة الأكاديمية للجميع.</p>
        </div>
        <Link href="/drills/new" className="btn-primary h-11 px-4 shrink-0">
          <Plus size={18} /> <span>تمرين جديد</span>
        </Link>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 mb-3">
        {tabs.map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => {
              setTab(t.v);
              setCat(null);
            }}
            className={clsx("h-10 px-3.5 rounded-xl inline-flex items-center gap-2 text-[14px] font-bold shrink-0 transition-colors", tab === t.v ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}
          >
            {t.icon}
            {t.label}
            <span className={clsx("num text-[12px] min-w-5 h-5 px-1.5 rounded-full grid place-items-center", tab === t.v ? "bg-white/15" : t.v === "pending" && t.n && me.canApprove ? "bg-gold text-navy-900" : "bg-silver-100 text-ink-2")}>{t.n}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <label className="field h-11 flex items-center gap-2 py-0 sm:max-w-xs">
          <Search size={16} className="text-ink-2 shrink-0" />
          <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="بحث باسم التمرين" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button type="button" onClick={() => setQ("")} className="text-ink-2" aria-label="مسح">
              <X size={15} />
            </button>
          )}
        </label>
        {cats.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 items-center">
            <button type="button" onClick={() => setCat(null)} className={clsx("chip h-9 px-3 text-[13px] shrink-0", !cat ? "bg-ice text-navy-900" : "bg-white border border-silver-200 text-navy")}>
              الكل
            </button>
            {cats.map((c) => (
              <button key={c} type="button" onClick={() => setCat(cat === c ? null : c)} className={clsx("chip h-9 px-3 text-[13px] shrink-0", cat === c ? "bg-ice text-navy-900" : "bg-white border border-silver-200 text-navy")}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-silver bg-white/60 p-10 text-center">
          <div className="text-navy font-extrabold text-[17px]">{tab === "library" ? "المكتبة فاضية" : tab === "pending" ? "ما في تمارين بانتظار الاعتماد" : "ما عندك مسودات"}</div>
          <p className="text-ink-2 text-sm mt-1">{tab === "library" ? "أول تمرين يعتمده المالك أو مدير الفرع يظهر هنا." : "ارسم تمرين جديد واحفظه."}</p>
          {tab !== "pending" && (
            <Link href="/drills/new" className="btn-primary h-11 px-4 mt-4 inline-flex">
              <Plus size={18} /> تمرين جديد
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((d) => (
            <DrillCard key={d.id} d={d} author={nameOf(d.author_id)} showStatus={tab !== "library"} />
          ))}
        </div>
      )}
    </div>
  );
}

function DrillCard({ d, author, showStatus }: { d: Drill; author: string; showStatus: boolean }) {
  const board = useMemo(() => parseBoard(d.board), [d.board]);
  const frames = board.frames.length;
  return (
    <Link href={`/drills/${d.id}`} className="card group overflow-hidden flex flex-col hover:border-ice transition">
      <div className="relative aspect-[16/11] bg-navy-900 overflow-hidden">
        <BoardStatic board={board} className="absolute inset-0 w-full h-full transition-transform duration-300 group-hover:scale-[1.03]" title={d.title} />
        {frames > 1 && <span className="absolute top-2 left-2 chip bg-navy-900/85 text-white text-[11px]">{frames} مراحل</span>}
        {showStatus && <span className={clsx("absolute top-2 right-2 chip text-[11px]", STATUS_CHIP[d.status])}>{STATUS_LABEL[d.status]}</span>}
      </div>
      <div className="p-3.5 flex-1 flex flex-col gap-1.5">
        <div className="font-extrabold text-navy text-[15.5px] leading-snug line-clamp-2">{d.title || "بدون اسم"}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
          {d.category && <span className="chip bg-navy-50 text-navy text-[11px]">{d.category}</span>}
          {d.duration_min ? (
            <span className="inline-flex items-center gap-1">
              <Clock size={13} /> <span className="num">{d.duration_min}</span> د
            </span>
          ) : null}
          {d.age_group && <span className="num">{bidi(`فئة ${d.age_group}`)}</span>}
          {d.players && (
            <span className="inline-flex items-center gap-1">
              <Users size={13} /> <span className="num">{bidi(d.players)}</span>
            </span>
          )}
        </div>
        {d.status === "returned" && d.review_note && <div className="text-[12px] text-error bg-error-100 rounded-lg px-2 py-1 line-clamp-2">{d.review_note}</div>}
        <div className="mt-auto pt-1.5 text-[11.5px] text-ink-2 flex items-center justify-between gap-2">
          <span className="truncate">{author}</span>
          <span className="shrink-0">{ago(d.updated_at)}</span>
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
