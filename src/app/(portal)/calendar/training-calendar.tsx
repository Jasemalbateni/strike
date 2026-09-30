"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import clsx from "clsx";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { ar } from "date-fns/locale";
import { ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, Clock, ClipboardCheck, Flag, Plus, Search, StickyNote, Trash2, Trophy, Palmtree, X, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field } from "@/components/ui";
import { useConfirm } from "@/components/confirm";
import { BoardStatic } from "@/components/drills/render";
import { parseBoard } from "@/lib/drills/board";
import { CATEGORIES, type Drill } from "@/lib/drills/meta";
import { isTrainingDay, type Branch, type Group } from "@/lib/players";
import { useMediaQuery } from "@/lib/use-media-query";
import { bidi } from "@/lib/bidi";

const WEEK_START = 6; // Saturday
const DAY_NAMES = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const DAY_SHORT_AR = ["سبت", "أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"];

type Kind = "drill" | "event" | "match" | "holiday" | "note";
type DrillLite = Pick<Drill, "id" | "title" | "category" | "duration_min" | "board" | "status">;
type Item = {
  id: string;
  item_date: string;
  branch_id: string | null;
  group_id: string | null;
  kind: Kind;
  drill_id: string | null;
  title: string;
  notes: string;
  duration_min: number | null;
  start_time: string | null;
  position: number;
  created_by: string | null;
  drills?: DrillLite | null;
};
type SessionLite = { id: string; branch_id: string; session_date: string; cancelled: boolean };

const KIND: Record<Exclude<Kind, "drill">, { label: string; icon: React.ReactNode; chip: string }> = {
  event: { label: "حدث", icon: <Flag size={14} />, chip: "bg-gold-100 text-navy-900" },
  match: { label: "مباراة", icon: <Trophy size={14} />, chip: "bg-ice-100 text-navy" },
  holiday: { label: "إجازة", icon: <Palmtree size={14} />, chip: "bg-error-100 text-error" },
  note: { label: "ملاحظة", icon: <StickyNote size={14} />, chip: "bg-silver-100 text-ink-2" },
};

type Me = { id: string; canApprove: boolean; canManage: boolean; canDraw: boolean; canAttendance: boolean };

export default function TrainingCalendar({ me, today, branches, groups }: { me: Me; today: string; branches: Branch[]; groups: Group[] }) {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [month, setMonth] = useState(() => startOfMonth(parseISO(today)));
  const [selected, setSelected] = useState(today);
  const [branchId, setBranchId] = useState<string | null>(branches.length > 1 ? null : branches[0]?.id ?? null);
  const [items, setItems] = useState<Item[]>([]);
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [present, setPresent] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(false);
  const [eventForm, setEventForm] = useState<Item | "new" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_START });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_START });
  const from = format(gridStart, "yyyy-MM-dd");
  const to = format(gridEnd, "yyyy-MM-dd");
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd }).map((d) => format(d, "yyyy-MM-dd"));

  const [tick, setTick] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [pi, ss] = await Promise.all([
        supabase.from("plan_items").select("*, drills(id, title, category, duration_min, board, status)").gte("item_date", from).lte("item_date", to).order("position"),
        supabase.from("sessions").select("id, branch_id, session_date, cancelled").gte("session_date", from).lte("session_date", to),
      ]);
      const sess = (ss.data ?? []) as SessionLite[];
      const counts: Record<string, number> = {};
      if (sess.length) {
        const { data } = await supabase.from("attendance").select("session_id, status").in("session_id", sess.map((s) => s.id));
        for (const a of (data ?? []) as { session_id: string; status: string }[]) if (a.status === "present" || a.status === "late") counts[a.session_id] = (counts[a.session_id] ?? 0) + 1;
      }
      if (!alive) return;
      setItems((pi.data ?? []) as Item[]);
      setSessions(sess);
      setPresent(counts);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, from, to, tick]);

  useEffect(() => {
    const ch = supabase
      .channel("plan-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_items" }, () => setTick((t) => t + 1))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase]);

  function flash(t: string) {
    setToast(t);
    window.setTimeout(() => setToast((x) => (x === t ? null : x)), 2400);
  }

  const visibleBranches = branches.filter((b) => !branchId || b.id === branchId);
  const itemsOn = (d: string) => items.filter((i) => i.item_date === d && (!branchId || !i.branch_id || i.branch_id === branchId)).sort((a, b) => a.position - b.position);
  const trainingOn = (d: string) => visibleBranches.filter((b) => isTrainingDay(d, b.training_days));
  const sessionOn = (d: string) => sessions.filter((s) => s.session_date === d && (!branchId || s.branch_id === branchId));
  const groupName = (id: string | null) => bidi(groups.find((g) => g.id === id)?.name);

  async function move(it: Item, dir: -1 | 1) {
    const list = itemsOn(it.item_date);
    const i = list.findIndex((x) => x.id === it.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const other = list[j];
    const a = { ...it, position: other.position === it.position ? it.position + dir : other.position };
    const b = { ...other, position: it.position };
    setItems((all) => all.map((x) => (x.id === a.id ? a : x.id === b.id ? b : x)));
    const [r1, r2] = await Promise.all([supabase.from("plan_items").update({ position: a.position }).eq("id", a.id), supabase.from("plan_items").update({ position: b.position }).eq("id", b.id)]);
    if (r1.error || r2.error) {
      flash("تعذّر الترتيب");
      reload();
    }
  }

  async function remove(it: Item) {
    const name = it.kind === "drill" ? it.drills?.title ?? "التمرين" : it.title;
    if (!(await confirm({ title: `إزالة «${name}» من اليوم؟`, message: it.kind === "drill" ? "التمرين يبقى في المكتبة، بس ينشال من هذا اليوم." : undefined, confirmText: "إزالة" }))) return;
    setItems((all) => all.filter((x) => x.id !== it.id));
    const { error } = await supabase.from("plan_items").delete().eq("id", it.id);
    if (error) {
      flash("ما عندك صلاحية تحذف هذا");
      reload();
    }
  }

  async function addDrill(d: DrillLite, groupId: string | null) {
    const pos = Math.max(-1, ...itemsOn(selected).map((x) => x.position)) + 1;
    const { data, error } = await supabase
      .from("plan_items")
      .insert({ item_date: selected, branch_id: branchId ?? branches[0]?.id ?? null, group_id: groupId, kind: "drill", drill_id: d.id, duration_min: d.duration_min, position: pos })
      .select("*, drills(id, title, category, duration_min, board, status)")
      .single();
    if (error || !data) return flash("تعذّرت الإضافة");
    setItems((all) => [...all.filter((x) => x.id !== data.id), data as Item]);
    flash("أُضيف التمرين لليوم");
  }

  const sel = parseISO(selected);
  const selItems = itemsOn(selected);
  const selDrills = selItems.filter((i) => i.kind === "drill");
  const selEvents = selItems.filter((i) => i.kind !== "drill");
  const selTraining = trainingOn(selected);
  const selSessions = sessionOn(selected);
  const planned = selDrills.reduce((s, i) => s + (i.duration_min ?? i.drills?.duration_min ?? 0), 0);
  const sessionLen = selTraining[0]?.session_minutes ?? 60;
  const canRemove = (it: Item) => it.created_by === me.id || me.canApprove || me.canManage;

  const dayPanel = (
    <div className="grid gap-4">
      <div>
        <div className="text-ink-2 text-[13px] font-bold">{selected === today ? "اليوم" : format(sel, "EEEE", { locale: ar })}</div>
        <div className="font-extrabold text-navy text-[22px] leading-tight">
          <span className="num">{format(sel, "d")}</span> {format(sel, "MMMM", { locale: ar })}
        </div>
        <div className="mt-2 grid gap-1.5">
          {selTraining.length === 0 && <div className="text-ink-2 text-[13px]">ما فيه تدريب مجدول في هذا اليوم.</div>}
          {selTraining.map((b) => {
            const s = selSessions.find((x) => x.branch_id === b.id);
            return (
              <div key={b.id} className={clsx("rounded-xl px-3 py-2 text-[13px] font-bold flex items-center gap-2", s?.cancelled ? "bg-error-100 text-error" : "bg-ice-50 text-navy")}>
                <CalendarDays size={15} />
                <span>تدريب {b.name}</span>
                {b.session_time && <span className="num text-ink-2">{fmtTime(b.session_time)}</span>}
                <span className="ms-auto">
                  {s?.cancelled ? "ملغاة" : s && selected <= today ? (
                    <span className="num">حضر {present[s.id] ?? 0}</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="font-extrabold text-navy text-[15px]">خطة الحصة</div>
          {selDrills.length > 0 && (
            <div className="text-[12px] font-bold text-ink-2">
              <span className={clsx("num", planned > sessionLen ? "text-error" : "text-navy")}>{planned}</span> / <span className="num">{sessionLen}</span> دقيقة
            </div>
          )}
        </div>
        {selDrills.length > 0 && (
          <div className="h-1.5 rounded-full bg-silver-100 overflow-hidden mb-3">
            <div className={clsx("h-full rounded-full", planned > sessionLen ? "bg-error" : "bg-ice")} style={{ width: `${Math.min(100, (planned / sessionLen) * 100)}%` }} />
          </div>
        )}
        {selDrills.length === 0 ? (
          <div className="rounded-xl border border-dashed border-silver p-4 text-center text-ink-2 text-[13px]">لا توجد تمارين لهذا اليوم بعد.</div>
        ) : (
          <div className="grid gap-2">
            {selDrills.map((it, i) => (
              <DrillRow key={it.id} it={it} index={i} last={i === selDrills.length - 1} group={groupName(it.group_id)} onUp={() => move(it, -1)} onDown={() => move(it, 1)} onRemove={canRemove(it) ? () => remove(it) : undefined} />
            ))}
          </div>
        )}
        <button type="button" onClick={() => setPicker(true)} className="btn-primary w-full mt-3 h-11">
          <Plus size={18} /> تمرين من المكتبة
        </button>
      </div>

      <div>
        <div className="font-extrabold text-navy text-[15px] mb-2">أحداث وملاحظات</div>
        {selEvents.length > 0 && (
          <div className="grid gap-2 mb-2">
            {selEvents.map((it) => {
              const k = KIND[it.kind as Exclude<Kind, "drill">];
              return (
                <div key={it.id} className="rounded-xl border border-silver-200 bg-white px-3 py-2.5 flex items-start gap-2.5">
                  <span className={clsx("chip mt-0.5 shrink-0", k.chip)}>
                    {k.icon} {k.label}
                  </span>
                  <button type="button" onClick={() => setEventForm(it)} className="min-w-0 flex-1 text-start">
                    <div className="font-bold text-navy text-[14px]">
                      {it.title}
                      {it.start_time && <span className="num text-ink-2 font-medium text-[12px] ms-1.5">{fmtTime(it.start_time)}</span>}
                    </div>
                    {it.notes && <div className="text-ink-2 text-[12.5px] whitespace-pre-wrap mt-0.5">{it.notes}</div>}
                  </button>
                  {canRemove(it) && (
                    <button type="button" onClick={() => remove(it)} className="h-8 w-8 grid place-items-center rounded-lg text-ink-2 hover:text-error hover:bg-error-100 shrink-0" aria-label="حذف">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button type="button" onClick={() => setEventForm("new")} className="btn-outline w-full h-11">
          <Plus size={17} /> حدث / مباراة / ملاحظة
        </button>
      </div>

      {me.canAttendance && selTraining.length > 0 && selected <= today && (
        <Link href="/attendance" className="btn-ghost h-10 text-[13px] justify-center">
          <ClipboardCheck size={16} /> فتح الحضور
        </Link>
      )}
    </div>
  );

  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 max-w-7xl">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="display text-navy text-[26px] sm:text-[36px] leading-none">التقويم</h1>
          <p className="text-ink-2 text-sm mt-1.5">أيام التدريب، خطة كل حصة، والأحداث.</p>
        </div>
        <div className="flex items-center gap-2">
          {branches.length > 1 && (
            <select className="field w-auto h-10" value={branchId ?? ""} onChange={(e) => setBranchId(e.target.value || null)}>
              <option value="">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {me.canDraw && (
            <Link href="/drills" className="btn-outline h-10 px-3 text-sm">
              <BookOpen size={16} /> <span className="hidden sm:inline">مكتبة التمارين</span>
            </Link>
          )}
        </div>
      </div>

      <div className={clsx("grid gap-5", wide && "grid-cols-[minmax(0,1fr)_360px]")}>
        <div className="card p-3 sm:p-4 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))} className="h-10 w-10 grid place-items-center rounded-xl hover:bg-navy-50 text-navy" aria-label="الشهر السابق">
                <ChevronRight size={20} />
              </button>
              <div className="font-extrabold text-navy text-[17px] min-w-32 text-center">
                {format(month, "MMMM", { locale: ar })} <span className="num">{format(month, "yyyy")}</span>
              </div>
              <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} className="h-10 w-10 grid place-items-center rounded-xl hover:bg-navy-50 text-navy" aria-label="الشهر التالي">
                <ChevronLeft size={20} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setMonth(startOfMonth(parseISO(today)));
                setSelected(today);
              }}
              className="chip h-9 px-3 bg-navy-50 text-navy text-[13px]"
            >
              اليوم
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_NAMES.map((d, i) => (
              <div key={d} className="text-center text-[11px] sm:text-[11.5px] font-bold text-ink-2 py-1 truncate">
                {wide ? d : DAY_SHORT_AR[i]}
              </div>
            ))}
          </div>
          <div className={clsx("grid grid-cols-7 gap-1", loading && "opacity-60")}>
            {days.map((d) => {
              const inMonth = isSameMonth(parseISO(d), month);
              const its = itemsOn(d);
              const tr = trainingOn(d);
              const ss = sessionOn(d);
              const cancelled = ss.length > 0 && ss.every((s) => s.cancelled);
              const att = ss.reduce((n, s) => n + (present[s.id] ?? 0), 0);
              const isSel = d === selected;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setSelected(d);
                    if (!wide) window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                  }}
                  className={clsx(
                    "relative rounded-xl border text-start transition-colors flex flex-col",
                    wide ? "min-h-[104px] p-1.5" : "min-h-[54px] p-1 items-center",
                    isSel ? "border-ice ring-2 ring-ice/40 bg-ice-50" : "border-silver-200 hover:border-ice/60",
                    !inMonth && "opacity-45",
                    tr.length > 0 && !isSel && "bg-navy-50/60",
                  )}
                >
                  <div className={clsx("flex items-center gap-1 w-full", !wide && "justify-center")}>
                    <span className={clsx("num text-[13px] font-bold h-6 min-w-6 px-1 rounded-full grid place-items-center", d === today ? "bg-navy text-white" : "text-navy")}>{format(parseISO(d), "d")}</span>
                    {wide && tr.length > 0 && <span className={clsx("text-[10.5px] font-bold truncate", cancelled ? "text-error line-through" : "text-ice-600")}>تدريب</span>}
                    {wide && ss.length > 0 && !cancelled && d <= today && <span className="num text-[10.5px] text-ink-2 ms-auto">{att}✓</span>}
                  </div>
                  {wide ? (
                    <div className="mt-1 grid gap-0.5 w-full">
                      {its.slice(0, 3).map((it) => (
                        <span key={it.id} className={clsx("truncate rounded-md px-1.5 py-0.5 text-[11px] font-bold", it.kind === "drill" ? "bg-navy text-white" : KIND[it.kind as Exclude<Kind, "drill">].chip)}>
                          {it.kind === "drill" ? it.drills?.title ?? "تمرين" : it.title}
                        </span>
                      ))}
                      {its.length > 3 && <span className="text-[10.5px] font-bold text-ink-2 px-1">+{its.length - 3}</span>}
                    </div>
                  ) : (
                    <div className="mt-1 flex gap-0.5 justify-center flex-wrap">
                      {tr.length > 0 && <span className={clsx("h-1.5 w-1.5 rounded-full", cancelled ? "bg-error" : "bg-ice")} />}
                      {its.some((i) => i.kind === "drill") && <span className="h-1.5 w-1.5 rounded-full bg-navy" />}
                      {its.some((i) => i.kind !== "drill") && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11.5px] text-ink-2 font-bold">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ice" /> يوم تدريب
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-navy" /> تمارين مخططة
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gold" /> حدث / ملاحظة
            </span>
          </div>
        </div>

        <aside ref={panelRef} className={clsx("card p-4 min-w-0 scroll-mt-20", wide && "self-start sticky top-6")}>
          {dayPanel}
        </aside>
      </div>

      {toast && <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] md:bottom-6 inset-x-4 md:inset-x-auto md:end-6 z-[60] rounded-xl bg-navy text-white px-4 py-2.5 text-sm font-bold shadow-[var(--shadow-pop)] fade-up text-center">{toast}</div>}

      {picker && <DrillPicker onClose={() => setPicker(false)} groups={groups.filter((g) => !branchId || g.branch_id === branchId)} dateLabel={`${format(sel, "EEEE d MMMM", { locale: ar })}`} onPick={(d, g) => addDrill(d, g)} />}
      {eventForm && (
        <EventModal
          item={eventForm === "new" ? null : eventForm}
          date={selected}
          branchId={branchId ?? branches[0]?.id ?? null}
          nextPos={Math.max(-1, ...selItems.map((x) => x.position)) + 1}
          onClose={() => setEventForm(null)}
          onSaved={(it) => {
            setItems((all) => [...all.filter((x) => x.id !== it.id), it]);
            setEventForm(null);
          }}
        />
      )}
    </div>
  );
}

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
}

function DrillRow({ it, index, last, group, onUp, onDown, onRemove }: { it: Item; index: number; last: boolean; group?: string; onUp: () => void; onDown: () => void; onRemove?: () => void }) {
  const d = it.drills;
  const board = useMemo(() => (d ? parseBoard(d.board) : null), [d]);
  return (
    <div className="rounded-xl border border-silver-200 bg-white p-2 flex items-center gap-2.5">
      <span className="num text-[12px] font-bold text-ink-2 w-4 text-center shrink-0">{index + 1}</span>
      <Link href={d ? `/drills/${d.id}` : "#"} className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="w-[74px] h-[50px] rounded-lg overflow-hidden bg-navy-900 shrink-0 grid place-items-center">{board ? <BoardStatic board={board} className="w-full h-full" /> : null}</span>
        <span className="min-w-0">
          <span className="block font-bold text-navy text-[14px] truncate">{d?.title ?? "تمرين محذوف"}</span>
          <span className="flex items-center gap-2 text-[11.5px] text-ink-2">
            {(it.duration_min ?? d?.duration_min) ? (
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> <span className="num">{it.duration_min ?? d?.duration_min}</span> د
              </span>
            ) : null}
            {d?.category && <span className="truncate">{d.category}</span>}
            {group && <span className="chip bg-navy-50 text-navy text-[10.5px]">{group}</span>}
          </span>
        </span>
      </Link>
      <div className="flex flex-col shrink-0">
        <button type="button" onClick={onUp} disabled={index === 0} className="h-6 w-7 grid place-items-center rounded text-ink-2 hover:text-navy disabled:opacity-25" aria-label="للأعلى">
          <ArrowUp size={14} />
        </button>
        <button type="button" onClick={onDown} disabled={last} className="h-6 w-7 grid place-items-center rounded text-ink-2 hover:text-navy disabled:opacity-25" aria-label="للأسفل">
          <ArrowDown size={14} />
        </button>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} className="h-9 w-9 grid place-items-center rounded-lg text-ink-2 hover:text-error hover:bg-error-100 shrink-0" aria-label="إزالة من اليوم">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function DrillPicker({ onClose, groups, dateLabel, onPick }: { onClose: () => void; groups: Group[]; dateLabel: string; onPick: (d: DrillLite, groupId: string | null) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<DrillLite[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    supabase
      .from("drills")
      .select("id, title, category, duration_min, board, status")
      .eq("status", "approved")
      .order("title")
      .then(({ data }) => {
        if (alive) setList((data ?? []) as DrillLite[]);
      });
    return () => {
      alive = false;
    };
  }, [supabase]);
  const shown = (list ?? []).filter((d) => (!cat || d.category === cat) && (!q.trim() || d.title.includes(q.trim())));
  const cats = CATEGORIES.filter((c) => (list ?? []).some((d) => d.category === c));
  return (
    <Modal open onClose={onClose} title={`تمرين ليوم ${dateLabel}`} wide footer={<button type="button" className="btn-primary ms-auto" onClick={onClose}>تم</button>}>
      <div className="grid gap-3">
        <label className="field h-11 flex items-center gap-2 py-0">
          <Search size={16} className="text-ink-2 shrink-0" />
          <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="بحث في المكتبة" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {groups.length > 0 && (
            <>
              <button type="button" onClick={() => setGroupId(null)} className={clsx("chip h-8 px-3 text-[12.5px]", !groupId ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
                كل الفئات
              </button>
              {groups.map((g) => (
                <button key={g.id} type="button" onClick={() => setGroupId(g.id)} className={clsx("chip h-8 px-3 text-[12.5px]", groupId === g.id ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
                  {bidi(g.name)}
                </button>
              ))}
              <span className="w-px bg-silver-200 mx-1" />
            </>
          )}
          {cats.map((c) => (
            <button key={c} type="button" onClick={() => setCat(cat === c ? null : c)} className={clsx("chip h-8 px-3 text-[12.5px]", cat === c ? "bg-ice text-navy-900" : "bg-white border border-silver-200 text-navy")}>
              {c}
            </button>
          ))}
        </div>
        {list === null ? (
          <div className="p-8 text-center text-ink-2">جارٍ التحميل…</div>
        ) : shown.length === 0 ? (
          <div className="p-8 text-center text-ink-2">
            {list.length === 0 ? "المكتبة فاضية — التمارين المعتمدة تظهر هنا." : "ما في نتائج."}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {shown.map((d) => {
              const done = added.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    onPick(d, groupId);
                    setAdded((a) => [...a, d.id]);
                  }}
                  className={clsx("rounded-xl border overflow-hidden text-start transition", done ? "border-ice ring-2 ring-ice/40" : "border-silver-200 hover:border-ice")}
                >
                  <PickerThumb d={d} />
                  <div className="p-2">
                    <div className="font-bold text-navy text-[13px] leading-snug line-clamp-2">{d.title}</div>
                    <div className="text-[11px] text-ink-2 mt-0.5">
                      {d.category}
                      {d.duration_min ? <span className="num"> · {d.duration_min} د</span> : null}
                      {done && <span className="text-ice-600 font-bold"> · أُضيف</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function PickerThumb({ d }: { d: DrillLite }) {
  const board = useMemo(() => parseBoard(d.board), [d.board]);
  return (
    <span className="block aspect-[16/11] bg-navy-900">
      <BoardStatic board={board} className="w-full h-full" />
    </span>
  );
}

function EventModal({ item, date, branchId, nextPos, onClose, onSaved }: { item: Item | null; date: string; branchId: string | null; nextPos: number; onClose: () => void; onSaved: (it: Item) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [kind, setKind] = useState<Exclude<Kind, "drill">>((item?.kind as Exclude<Kind, "drill">) ?? "event");
  const [title, setTitle] = useState(item?.title ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [time, setTime] = useState(item?.start_time?.slice(0, 5) ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const payload = { kind, title: title.trim(), notes: notes.trim(), start_time: time || null };
    const res = item
      ? await supabase.from("plan_items").update(payload).eq("id", item.id).select("*").single()
      : await supabase.from("plan_items").insert({ ...payload, item_date: date, branch_id: branchId, position: nextPos }).select("*").single();
    setBusy(false);
    if (res.error || !res.data) return setErr("تعذّر الحفظ — تحقق من الاتصال");
    onSaved(res.data as Item);
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? "تعديل" : `إضافة ليوم ${format(parseISO(date), "d MMMM", { locale: ar })}`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button form="event-form" className="btn-primary" disabled={busy || !title.trim()}>
            {busy ? "جارٍ…" : "حفظ"}
          </button>
        </>
      }
    >
      <form id="event-form" onSubmit={save} className="grid gap-4">
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(KIND) as Exclude<Kind, "drill">[]).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={clsx("h-11 rounded-xl border font-bold text-[13px] inline-flex items-center justify-center gap-1.5", kind === k ? "bg-navy text-white border-navy" : "bg-white border-silver-200 text-navy")}>
              {KIND[k].icon} {KIND[k].label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="العنوان">
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={kind === "match" ? "مباراة ودية ضد…" : kind === "holiday" ? "إجازة العيد" : "العنوان"} autoFocus />
          </Field>
          <Field label="الوقت">
            <input type="time" className="field num" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="تفاصيل">
          <textarea className="field min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {err && <p className="text-error text-[13px] font-bold">{err}</p>}
      </form>
    </Modal>
  );
}
