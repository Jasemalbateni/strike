"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Presentation, FileText, MessageSquare, Pin, Clock, EyeOff, Activity } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { EmptyState } from "@/components/ui";
import { CATEGORIES, categoryLabel } from "@/lib/resources";
import { bidi } from "@/lib/bidi";

export type Card = {
  id: string;
  kind: "article" | "presentation";
  title: string;
  category: string;
  summary: string;
  pinned: boolean;
  published: boolean;
  created_at: string;
  cover: string | null;
  pages: number | null;
  minutes: number;
  comments: number;
  unread: boolean;
};

export default function ResourcesList({ cards, isOwner }: { cards: Card[]; isOwner: boolean }) {
  const [cat, setCat] = useState<string>("all");
  const [kind, setKind] = useState<"all" | "article" | "presentation">("all");
  const used = new Set(cards.map((c) => c.category));
  const shown = cards.filter((c) => (cat === "all" || c.category === cat) && (kind === "all" || c.kind === kind));
  // built-in interactive resource (lives in code, not in the resources table)
  const showLab = cat === "all" && kind !== "presentation";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl p-0.5 bg-silver-100">
          {(
            [
              ["all", "الكل"],
              ["presentation", "برزنتيشن"],
              ["article", "مواضيع"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={clsx("h-9 px-3 rounded-lg text-[13.5px] font-bold", kind === k ? "bg-white text-navy shadow-sm" : "text-ink-2")}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setCat("all")} className={clsx("chip h-9 px-3 text-[13px]", cat === "all" ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
            كل التصنيفات
          </button>
          {CATEGORIES.filter((c) => used.has(c.key)).map((c) => (
            <button key={c.key} onClick={() => setCat(c.key)} className={clsx("chip h-9 px-3 text-[13px]", cat === c.key ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
              {c.label}
            </button>
          ))}
        </div>
        {isOwner && (
          <div className="flex gap-2 ms-auto">
            <Link href="/resources/new?kind=presentation" className="btn-outline h-10">
              <Presentation size={17} /> برزنتيشن
            </Link>
            <Link href="/resources/new" className="btn-primary h-10">
              <Plus size={17} /> موضوع جديد
            </Link>
          </div>
        )}
      </div>

      {shown.length === 0 && !showLab ? (
        <EmptyState title={cards.length ? "ما فيه شي بهالتصنيف" : "المصادر فاضية"} hint={isOwner ? "ابدأ بأول موضوع أو ارفع برزنتيشن آخر اجتماع." : "أي موضوع تنشره الإدارة بيظهر هنا."} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {showLab && (
            <Link href="/resources/movement-lab" className="card overflow-hidden flex flex-col hover:border-ice transition group">
              <div className="aspect-[16/9] relative overflow-hidden grid place-items-center bg-[radial-gradient(circle_at_30%_20%,#26407a,#0f1b3a)]">
                <svg viewBox="0 0 200 150" className="h-[78%] group-hover:scale-[1.04] transition" aria-hidden="true">
                  <line x1="20" y1="132" x2="180" y2="132" stroke="#C7CED9" strokeWidth="2" strokeLinecap="round" opacity=".6" />
                  <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="98,74 82,97 67,121" stroke="#8fa3d6" strokeWidth="7" />
                    <polyline points="106,36 118,52 129,38" stroke="#8fa3d6" strokeWidth="6" />
                    <polyline points="106,36 98,74" stroke="#fff" strokeWidth="9" />
                    <polyline points="98,74 122,88 117,115" stroke="#fff" strokeWidth="7" />
                    <polyline points="106,36 93,51 95,69" stroke="#fff" strokeWidth="6" />
                  </g>
                  <circle cx="109" cy="24" r="9.5" fill="#fff" />
                  <circle cx="140" cy="125" r="6.5" fill="#4DA8FF" stroke="#fff" strokeWidth="1.5" />
                </svg>
                <div className="absolute top-2.5 start-2.5 flex gap-1.5">
                  <span className="chip bg-gold text-navy-900 text-[11px] gap-1">
                    <Activity size={11} /> تفاعلي
                  </span>
                </div>
              </div>
              <div className="p-4 flex flex-col gap-1.5 flex-1">
                <span className="text-ice-600 text-[12px] font-bold">الإعداد البدني</span>
                <h3 className="font-extrabold text-navy text-[16px] leading-snug line-clamp-2">{bidi("المختبر الحركي: الجانب البدني لفئة 5–8")}</h3>
                <p className="text-ink-2 text-[13.5px] line-clamp-2">شخصيات متحركة تشرح آلية التنفيذ لكل صفة بدنية، مع التقسيم والأخطاء وحلولها والخطة الشهرية وبنك الألعاب.</p>
                <div className="mt-auto pt-2 flex items-center gap-3 text-[12px] text-ink-2">
                  <span>
                    <span className="num">49</span> حركة
                  </span>
                  <span>
                    <span className="num">16</span> بطاقة
                  </span>
                </div>
              </div>
            </Link>
          )}
          {shown.map((c) => (
            <Link key={c.id} href={`/resources/${c.id}`} className={clsx("card overflow-hidden flex flex-col hover:border-ice transition group", c.unread && "ring-2 ring-gold/60")}>
              <div className="aspect-[16/9] bg-navy relative overflow-hidden">
                {c.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.cover} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition" />
                ) : (
                  <div className="w-full h-full grid place-items-center bg-[radial-gradient(circle_at_30%_20%,#26407a,#0f1b3a)]">
                    {c.kind === "presentation" ? <Presentation size={40} className="text-ice/70" /> : <FileText size={40} className="text-ice/70" />}
                  </div>
                )}
                <div className="absolute top-2.5 start-2.5 flex gap-1.5">
                  {c.pinned && (
                    <span className="chip bg-gold text-navy-900 text-[11px] gap-1">
                      <Pin size={11} /> مثبّت
                    </span>
                  )}
                  {c.unread && <span className="chip bg-white text-navy text-[11px]">جديد</span>}
                  {!c.published && (
                    <span className="chip bg-navy-900/80 text-white text-[11px] gap-1">
                      <EyeOff size={11} /> مسودة
                    </span>
                  )}
                </div>
                {c.kind === "presentation" && (
                  <span className="absolute bottom-2.5 start-2.5 chip bg-navy-900/80 text-white text-[11px] gap-1">
                    <Presentation size={12} /> {c.pages ? `${c.pages} شريحة` : "برزنتيشن"}
                  </span>
                )}
              </div>
              <div className="p-4 flex flex-col gap-1.5 flex-1">
                <span className="text-ice-600 text-[12px] font-bold">{categoryLabel(c.category)}</span>
                <h3 className="font-extrabold text-navy text-[16px] leading-snug line-clamp-2">{c.title}</h3>
                {c.summary && <p className="text-ink-2 text-[13.5px] line-clamp-2">{c.summary}</p>}
                <div className="mt-auto pt-2 flex items-center gap-3 text-[12px] text-ink-2">
                  <span>{format(parseISO(c.created_at), "d MMMM yyyy", { locale: ar })}</span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> <span className="num">{c.minutes}</span> د
                  </span>
                  {c.comments > 0 && (
                    <span className="flex items-center gap-1 ms-auto">
                      <MessageSquare size={12} /> <span className="num">{c.comments}</span>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
