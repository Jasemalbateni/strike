"use client";

/* مكتبة التمارين — the library is made of drill SHEETS (diagram + explanation), approved by the owner or branch manager.
 * Drawings from the studio are a tool: they live in their own tab and can be used as a sheet's diagram. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import { BookOpen, Clock, FilePen, FileText, Hourglass, Layers, PenTool, Plus, Search, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BoardStatic } from "@/components/drills/render";
import { parseBoard } from "@/lib/drills/board";
import type { Drill } from "@/lib/drills/meta";
import { flattenLibrary, normalizeDrills, SHEET_CATEGORIES, SHEET_STATUS_CHIP, SHEET_STATUS_LABEL, totalMinutes, type DrillSheet, type LibraryDrill } from "@/lib/sheets";
import type { StaffName } from "@/lib/types";
import { bidi } from "@/lib/bidi";

type Tab = "library" | "pending" | "mine" | "drawings";

export default function DrillLibrary({ me, initialSheets, initialDrawings, staff, initialTab }: { me: { id: string; canApprove: boolean }; initialSheets: DrillSheet[]; initialDrawings: Drill[]; staff: StaffName[]; initialTab?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [sheets, setSheets] = useState(initialSheets);
  const [drawings, setDrawings] = useState(initialDrawings);
  const [tab, setTab] = useState<Tab>(initialTab === "pending" || initialTab === "mine" || initialTab === "drawings" ? initialTab : "library");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  useEffect(() => {
    const ch = supabase
      .channel("library-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "drill_sheets" }, (p) => {
        if (p.eventType === "DELETE") setSheets((a) => a.filter((s) => s.id !== (p.old as DrillSheet).id));
        else {
          const row = p.new as DrillSheet;
          setSheets((a) => [row, ...a.filter((s) => s.id !== row.id)]);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "drills" }, (p) => {
        if (p.eventType === "DELETE") setDrawings((a) => a.filter((d) => d.id !== (p.old as Drill).id));
        else {
          const row = p.new as Drill;
          setDrawings((a) => [row, ...a.filter((d) => d.id !== row.id)]);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase]);

  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.full_name ?? "";
  const needle = q.trim();

  const library = flattenLibrary(sheets.filter((s) => s.status === "approved"));
  const pending = sheets.filter((s) => s.status === "pending" && (me.canApprove || s.author_id === me.id));
  const mine = sheets.filter((s) => s.author_id === me.id && (s.status === "draft" || s.status === "returned"));

  const libShown = library.filter((x) => (!cat || x.drill.cat === cat) && (!needle || x.drill.title.includes(needle) || x.drill.code.includes(needle) || x.sheet.title.includes(needle)));
  const cats = SHEET_CATEGORIES.filter((c) => library.some((x) => x.drill.cat === c));
  const sheetList = (tab === "pending" ? pending : mine).filter((s) => !needle || s.title.includes(needle) || normalizeDrills(s.drills).some((d) => d.title.includes(needle)));
  const drawShown = drawings.filter((d) => !needle || d.title.includes(needle) || d.category.includes(needle));

  const tabs: { v: Tab; label: string; icon: React.ReactNode; n: number }[] = [
    { v: "library", label: "المكتبة", icon: <BookOpen size={16} />, n: library.length },
    { v: "pending", label: me.canApprove ? "بانتظار اعتمادك" : "بانتظار الاعتماد", icon: <Hourglass size={16} />, n: pending.length },
    { v: "mine", label: "مسوداتي", icon: <FilePen size={16} />, n: mine.length },
    { v: "drawings", label: "الرسومات", icon: <PenTool size={16} />, n: drawings.length },
  ];

  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="display text-navy text-[26px] sm:text-[36px] leading-none">مكتبة التمارين</h1>
          <p className="text-ink-2 text-sm mt-1.5">ورقة التمرين (رسم + شرح + أهداف + نقاط فنية) هي اللي تدخل المكتبة بعد الاعتماد، مقسّمة حسب المحور.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/drills/new" className="btn-outline h-11 px-4">
            <PenTool size={18} /> <span>رسم تمرين</span>
          </Link>
          <Link href="/sheets/new" className="btn-primary h-11 px-4">
            <Plus size={18} /> <span>إنشاء ورقة تمرين</span>
          </Link>
        </div>
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
          <input className="bg-transparent outline-none flex-1 min-w-0" placeholder={tab === "drawings" ? "بحث باسم الرسم" : "بحث باسم التمرين أو الرمز"} value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button type="button" onClick={() => setQ("")} className="text-ink-2" aria-label="مسح">
              <X size={15} />
            </button>
          )}
        </label>
        {tab === "library" && cats.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 items-center">
            <button type="button" onClick={() => setCat(null)} className={clsx("chip h-9 px-3 text-[13px] shrink-0", !cat ? "bg-ice text-navy-900" : "bg-white border border-silver-200 text-navy")}>
              الكل
            </button>
            {cats.map((c) => (
              <button key={c} type="button" onClick={() => setCat(cat === c ? null : c)} className={clsx("chip h-9 px-3 text-[13px] shrink-0", cat === c ? "bg-ice text-navy-900" : "bg-white border border-silver-200 text-navy")}>
                {c}
                <span className="num opacity-70">{library.filter((x) => x.drill.cat === c).length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "library" &&
        (libShown.length === 0 ? (
          <Empty title="المكتبة فاضية" hint="أول ورقة تمرين تُعتمد تظهر هنا تحت محورها." cta="إنشاء ورقة تمرين" href="/sheets/new" />
        ) : cat || needle ? (
          <Grid>
            {libShown.map((x) => (
              <LibraryCard key={`${x.sheet.id}:${x.index}`} x={x} author={nameOf(x.sheet.author_id)} />
            ))}
          </Grid>
        ) : (
          // grouped by category
          <div className="grid gap-7">
            {cats.map((c) => (
              <section key={c}>
                <h2 className="text-navy font-extrabold text-[17px] mb-3 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-ice" />
                  {c}
                  <span className="num text-[13px] text-ink-2 font-bold">{libShown.filter((x) => x.drill.cat === c).length}</span>
                </h2>
                <Grid>
                  {libShown
                    .filter((x) => x.drill.cat === c)
                    .map((x) => (
                      <LibraryCard key={`${x.sheet.id}:${x.index}`} x={x} author={nameOf(x.sheet.author_id)} />
                    ))}
                </Grid>
              </section>
            ))}
          </div>
        ))}

      {(tab === "pending" || tab === "mine") &&
        (sheetList.length === 0 ? (
          <Empty title={tab === "pending" ? "ما في أوراق بانتظار الاعتماد" : "ما عندك مسودات"} hint={tab === "pending" ? "لما يرسل مدرب ورقة تظهر هنا." : "أنشئ ورقة تمرين واحفظها."} cta={tab === "mine" ? "إنشاء ورقة تمرين" : undefined} href="/sheets/new" />
        ) : (
          <Grid>
            {sheetList.map((s) => (
              <SheetCard key={s.id} s={s} author={nameOf(s.author_id)} />
            ))}
          </Grid>
        ))}

      {tab === "drawings" &&
        (drawShown.length === 0 ? (
          <Empty title="ما في رسومات بعد" hint="ارسم تمريناً على لوحة الرسم، وبعدها تقدر تحوّله لورقة تمرين من داخله." cta="رسم تمرين" href="/drills/new" />
        ) : (
          <>
            <p className="text-ink-2 text-[13px] mb-3">الرسم لوحده ما يدخل المكتبة — افتحه واضغط «إنشاء ورقة من هذا الرسم»، أو اختره من داخل ورقة التمرين.</p>
            <Grid>
              {drawShown.map((d) => (
                <DrawingCard key={d.id} d={d} author={nameOf(d.author_id)} />
              ))}
            </Grid>
          </>
        ))}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</div>;
}

function Empty({ title, hint, cta, href }: { title: string; hint: string; cta?: string; href: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-silver bg-white/60 p-10 text-center">
      <div className="text-navy font-extrabold text-[17px]">{title}</div>
      <p className="text-ink-2 text-sm mt-1">{hint}</p>
      {cta && (
        <Link href={href} className="btn-primary h-11 px-4 mt-4 inline-flex">
          <Plus size={18} /> {cta}
        </Link>
      )}
    </div>
  );
}

function Thumb({ src, fallback }: { src?: string; fallback: React.ReactNode }) {
  return (
    <div className="relative aspect-[16/11] bg-[#d9e4ef] overflow-hidden grid place-items-center">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.03]" />
      ) : (
        fallback
      )}
    </div>
  );
}

/** one drill of an approved sheet */
function LibraryCard({ x, author }: { x: LibraryDrill; author: string }) {
  const { sheet, drill, index } = x;
  const n = normalizeDrills(sheet.drills).length;
  return (
    <Link href={`/sheets/${sheet.id}?d=${index}`} className="card group overflow-hidden flex flex-col hover:border-ice transition">
      <Thumb src={drill.img} fallback={<FileText size={40} className="text-navy/30" />} />
      {sheet.kind === "session" && (
        <span className="absolute top-2 left-2 chip bg-navy-900/85 text-white text-[11px]">
          <Layers size={12} /> من حصة · <span className="num">{index + 1}/{n}</span>
        </span>
      )}
      <div className="p-3.5 flex-1 flex flex-col gap-1.5">
        <div className="font-extrabold text-navy text-[15.5px] leading-snug line-clamp-2">
          {drill.title || "بدون اسم"}
          {drill.code && <span className="en text-ink-2 text-[12px] font-semibold ms-2">{drill.code}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
          <span className="chip bg-navy-50 text-navy text-[11px]">{drill.cat}</span>
          {drill.dur ? (
            <span className="inline-flex items-center gap-1">
              <Clock size={13} /> <span className="num">{drill.dur}</span> د
            </span>
          ) : null}
          <span className="num">{bidi(`فئة ${drill.age}`)}</span>
          {drill.players && (
            <span className="inline-flex items-center gap-1">
              <Users size={13} /> <span className="num">{bidi(drill.players)}</span>
            </span>
          )}
        </div>
        <div className="mt-auto pt-1.5 text-[11.5px] text-ink-2 flex items-center justify-between gap-2">
          <span className="truncate">{author}</span>
          <span className="shrink-0">{ago(sheet.updated_at)}</span>
        </div>
      </div>
    </Link>
  );
}

/** a whole sheet (pending / drafts) */
function SheetCard({ s, author }: { s: DrillSheet; author: string }) {
  const drills = normalizeDrills(s.drills);
  const mins = totalMinutes(drills);
  return (
    <Link href={`/sheets/${s.id}`} className="card group overflow-hidden flex flex-col hover:border-ice transition relative">
      <Thumb src={drills.find((d) => d.img)?.img} fallback={<FileText size={40} className="text-navy/30" />} />
      <span className={clsx("absolute top-2 right-2 chip text-[11px]", SHEET_STATUS_CHIP[s.status])}>{SHEET_STATUS_LABEL[s.status]}</span>
      {s.kind === "session" && (
        <span className="absolute top-2 left-2 chip bg-navy-900/85 text-white text-[11px]">
          <Layers size={12} /> حصة · <span className="num">{drills.length}</span>
        </span>
      )}
      <div className="p-3.5 flex-1 flex flex-col gap-1.5">
        <div className="font-extrabold text-navy text-[15.5px] leading-snug line-clamp-2">{s.title || "بدون اسم"}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
          {s.kind === "drill" && <span className="chip bg-navy-50 text-navy text-[11px]">{drills[0].cat}</span>}
          {mins ? (
            <span className="inline-flex items-center gap-1">
              <Clock size={13} /> <span className="num">{mins}</span> د
            </span>
          ) : null}
          {s.age_group && <span className="num">{bidi(`فئة ${s.age_group}`)}</span>}
        </div>
        {s.status === "returned" && s.review_note && <div className="text-[12px] text-error bg-error-100 rounded-lg px-2 py-1 line-clamp-2">{s.review_note}</div>}
        <div className="mt-auto pt-1.5 text-[11.5px] text-ink-2 flex items-center justify-between gap-2">
          <span className="truncate">{author}</span>
          <span className="shrink-0">{ago(s.updated_at)}</span>
        </div>
      </div>
    </Link>
  );
}

function DrawingCard({ d, author }: { d: Drill; author: string }) {
  const board = useMemo(() => parseBoard(d.board), [d.board]);
  const frames = board.frames.length;
  return (
    <Link href={`/drills/${d.id}`} className="card group overflow-hidden flex flex-col hover:border-ice transition">
      <div className="relative aspect-[16/11] bg-navy-900 overflow-hidden">
        <BoardStatic board={board} className="absolute inset-0 w-full h-full transition-transform duration-300 group-hover:scale-[1.03]" title={d.title} />
        {frames > 1 && <span className="absolute top-2 left-2 chip bg-navy-900/85 text-white text-[11px]">{frames} مراحل</span>}
      </div>
      <div className="p-3.5 flex-1 flex flex-col gap-1.5">
        <div className="font-extrabold text-navy text-[15.5px] leading-snug line-clamp-2">{d.title || "بدون اسم"}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
          {d.category && <span className="chip bg-navy-50 text-navy text-[11px]">{d.category}</span>}
          {d.age_group && <span className="num">{bidi(`فئة ${d.age_group}`)}</span>}
        </div>
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
