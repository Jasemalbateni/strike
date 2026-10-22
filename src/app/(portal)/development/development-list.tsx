"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowLeft, Target, TrendingUp, TrendingDown } from "lucide-react";
import clsx from "clsx";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { Avatar, EmptyState } from "@/components/ui";
import { Dots } from "@/components/development/charts";
import { PILLARS, fmt1, overall, pillarAvg, type Evaluation } from "@/lib/development";
import type { Group } from "@/lib/players";

export type Row = {
  id: string;
  full_name: string;
  age: number | null;
  group_id: string | null;
  kind: "subscriber" | "trial";
  latest: Pick<Evaluation, "eval_date" | "scores"> | null;
  previous: Pick<Evaluation, "eval_date" | "scores"> | null;
  evalCount: number;
  activeGoals: number;
};

type Sort = "name" | "score" | "stale";

export default function DevelopmentList({ rows, groups }: { rows: Row[]; groups: Group[] }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | "all">("all");
  const [sort, setSort] = useState<Sort>("name");
  const today = new Date();

  const shown = useMemo(() => {
    const list = rows.filter((r) => (group === "all" || r.group_id === group) && (!q.trim() || r.full_name.includes(q.trim())));
    const sc = (r: Row) => (r.latest ? (overall(r.latest.scores) ?? -1) : -1);
    if (sort === "score") return [...list].sort((a, b) => sc(b) - sc(a));
    if (sort === "stale") return [...list].sort((a, b) => (a.latest?.eval_date ?? "").localeCompare(b.latest?.eval_date ?? ""));
    return list;
  }, [rows, q, group, sort]);

  const notEvaluated = rows.filter((r) => !r.latest).length;

  return (
    <div className="flex flex-col gap-4">
      {notEvaluated > 0 && (
        <div className="rounded-xl bg-gold/15 text-navy px-4 py-2.5 text-[14px] font-bold">
          <span className="num">{notEvaluated}</span> {notEvaluated === 1 ? "لاعب ما تقيّم بعد" : "لاعبين ما تقيّموا بعد"}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={17} className="absolute top-1/2 -translate-y-1/2 start-3 text-ink-2" />
          <input className="field ps-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم اللاعب" />
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {[{ id: "all", name: "الكل" }, ...groups].map((g) => (
            <button key={g.id} onClick={() => setGroup(g.id)} className={clsx("chip h-9 px-3.5 text-[13.5px]", group === g.id ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
              {g.name}
            </button>
          ))}
        </div>
        <select className="field h-9 w-auto text-[13.5px] py-0" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="الترتيب">
          <option value="name">ترتيب: الاسم</option>
          <option value="score">ترتيب: الأعلى تقييماً</option>
          <option value="stale">ترتيب: الأقدم تقييماً</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="ما فيه لاعبين" hint="غيّر البحث أو الفئة." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => {
            const ov = r.latest ? overall(r.latest.scores) : null;
            const prev = r.previous ? overall(r.previous.scores) : null;
            const delta = ov !== null && prev !== null ? ov - prev : null;
            const days = r.latest ? differenceInCalendarDays(today, parseISO(r.latest.eval_date)) : null;
            return (
              <Link key={r.id} href={`/development/${r.id}`} className="card p-4 flex flex-col gap-3 hover:border-ice transition group">
                <div className="flex items-center gap-3">
                  <Avatar name={r.full_name} size={42} tone={r.latest ? "navy" : "light"} />
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-navy text-[15px] truncate">{r.full_name}</div>
                    <div className="text-ink-2 text-[12.5px] flex items-center gap-1.5">
                      {groups.find((g) => g.id === r.group_id)?.name ?? "بدون فئة"}
                      {r.age ? <span className="num">· {r.age} سنوات</span> : null}
                      {r.kind === "trial" && <span className="chip bg-ice-50 text-ice-600 text-[10.5px] px-1.5 py-0">تجربة</span>}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="num text-navy font-extrabold text-[24px] leading-none">{fmt1(ov)}</div>
                    {delta !== null && Math.abs(delta) >= 0.05 ? (
                      <div className={clsx("num text-[11.5px] font-bold flex items-center gap-0.5 justify-end", delta > 0 ? "text-[#1a8f5f]" : "text-error")}>
                        {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(1)}
                      </div>
                    ) : (
                      <div className="text-ink-2 text-[11px]">من 5</div>
                    )}
                  </div>
                </div>
                {r.latest ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {PILLARS.map((p) => (
                      <div key={p.key} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="text-ink-2 font-bold truncate">{p.label}</span>
                        <Dots value={pillarAvg(r.latest!.scores, p.key)} color={p.color} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-ink-2 text-[13px] rounded-lg bg-silver-100/70 px-3 py-2">لم يُقيّم بعد — افتح الملف وأضف أول تقييم</div>
                )}
                <div className="flex items-center gap-3 text-[12px] text-ink-2 border-t border-silver-200 pt-2.5">
                  <span>{days === null ? "—" : days === 0 ? "قُيّم اليوم" : `آخر تقييم قبل ${days} يوم`}</span>
                  {r.activeGoals > 0 && (
                    <span className="flex items-center gap-1">
                      <Target size={13} /> <span className="num">{r.activeGoals}</span> أهداف
                    </span>
                  )}
                  <ArrowLeft size={15} className="ms-auto text-navy opacity-0 group-hover:opacity-100 transition" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
