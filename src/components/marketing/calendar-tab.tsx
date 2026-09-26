"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronLeft, Plus, Inbox, Lightbulb, Clock } from "lucide-react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { useHub } from "./store";
import PostModal, { type PostDraft } from "./post-modal";
import { PlatformChip, StatusChip, Avatar } from "@/components/ui";
import { PLATFORMS, formatLabel, type Idea, type Platform, type Post } from "@/lib/types";

const WEEK_START = 6; // Saturday
const DAY_NAMES = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

export default function CalendarTab() {
  const { data, update, insert } = useHub();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [platformFilter, setPlatformFilter] = useState<Platform | null>(null);
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [active, setActive] = useState<{ kind: "post" | "idea"; item: Post | Idea } | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_START }), end: endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_START }) }),
    [month],
  );

  const posts = useMemo(() => (platformFilter ? data.posts.filter((p) => p.platform === platformFilter) : data.posts), [data.posts, platformFilter]);
  const scheduled = posts.filter((p) => p.scheduled_date);
  const unscheduled = posts.filter((p) => !p.scheduled_date);
  const ideas = data.ideas.filter((i) => !i.is_note && !i.moved_post_id);
  const monthCount = scheduled.filter((p) => isSameMonth(new Date(p.scheduled_date!), month)).length;

  const byDay = (d: Date) =>
    scheduled
      .filter((p) => isSameDay(new Date(p.scheduled_date!), d))
      .sort((a, b) => (a.scheduled_time ?? "99").localeCompare(b.scheduled_time ?? "99") || a.position - b.position);

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith("post-")) {
      const item = data.posts.find((p) => p.id === id.slice(5));
      if (item) setActive({ kind: "post", item });
    } else if (id.startsWith("idea-")) {
      const item = data.ideas.find((p) => p.id === id.slice(5));
      if (item) setActive({ kind: "idea", item });
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    const a = active;
    setActive(null);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!a || !over) return;
    if (a.kind === "post") {
      const post = a.item as Post;
      if (over === "tray-unscheduled") {
        if (post.scheduled_date) await update("posts", post.id, { scheduled_date: null, status: post.status === "scheduled" ? "approved" : post.status });
      } else if (over.startsWith("day-")) {
        const date = over.slice(4);
        if (post.scheduled_date !== date) await update("posts", post.id, { scheduled_date: date, status: post.status === "idea" || post.status === "draft" ? post.status : post.status });
      }
    } else if (a.kind === "idea" && over.startsWith("day-")) {
      const idea = a.item as Idea;
      const created = await insert<Post>("posts", {
        title: idea.title,
        caption: idea.body,
        platform: idea.platform === "general" ? "instagram" : idea.platform,
        status: "draft",
        scheduled_date: over.slice(4),
        idea_id: idea.id,
        position: data.posts.length,
      });
      if (created) await update("ideas", idea.id, { moved_post_id: created.id });
    }
  }

  const tray = (
    <div className="flex flex-col gap-4">
      <TrayZone id="tray-unscheduled" icon={<Inbox size={16} className="text-ice" />} title="غير مجدول" count={unscheduled.length} hint="اسحب منشور هنا لإلغاء موعده">
        {unscheduled.map((p) => (
          <PostChip key={p.id} post={p} onClick={() => setDraft(p)} full />
        ))}
      </TrayZone>
      <div className="card p-3">
        <div className="flex items-center gap-2 mb-2 text-navy font-extrabold text-[15px]">
          <Lightbulb size={16} className="text-gold" /> أفكار جاهزة للنقل <span className="num text-ink-2 text-sm font-bold">{ideas.length}</span>
        </div>
        <p className="text-ink-2 text-xs mb-2">اسحب الفكرة على أي يوم وتتحول لمنشور</p>
        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
          {ideas.length === 0 && <p className="text-ink-2 text-sm text-center py-3">لا توجد أفكار غير منقولة</p>}
          {ideas.map((i) => (
            <IdeaChip key={i.id} idea={i} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-4">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="card flex items-center p-1">
            <button onClick={() => setMonth((m) => addMonths(m, -1))} className="p-2 rounded-lg hover:bg-navy-50 text-navy" aria-label="الشهر السابق">
              <ChevronRight size={18} />
            </button>
            <button onClick={() => setMonth(startOfMonth(new Date()))} className="px-3 py-1.5 font-extrabold text-navy min-w-36 text-center">
              {format(month, "LLLL yyyy", { locale: ar })}
            </button>
            <button onClick={() => setMonth((m) => addMonths(m, 1))} className="p-2 rounded-lg hover:bg-navy-50 text-navy" aria-label="الشهر التالي">
              <ChevronLeft size={18} />
            </button>
          </div>
          <span className="text-ink-2 text-sm">
            <span className="num font-bold text-navy">{monthCount}</span> منشور هذا الشهر
          </span>
          <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
            <button onClick={() => setPlatformFilter(null)} className={clsx("chip px-2.5 py-1", !platformFilter ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
              الكل
            </button>
            {PLATFORMS.filter((p) => p.value !== "general").map((p) => (
              <button key={p.value} onClick={() => setPlatformFilter(platformFilter === p.value ? null : p.value)} className={clsx("chip px-2.5 py-1 whitespace-nowrap", platformFilter === p.value ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="ms-auto flex gap-2">
            <button className="btn-outline h-9 px-3 lg:hidden" onClick={() => setTrayOpen((o) => !o)}>
              <Inbox size={16} /> <span className="num">{unscheduled.length}</span>
            </button>
            <button className="btn-primary h-9 px-3" onClick={() => setDraft({ status: "draft", platform: "instagram" })}>
              <Plus size={16} /> منشور
            </button>
          </div>
        </div>

        {trayOpen && <div className="lg:hidden">{tray}</div>}

        <div className="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
          {/* month grid (md+) */}
          <div className="card overflow-hidden hidden md:block">
            <div className="grid grid-cols-7 bg-navy text-white text-xs font-bold">
              {DAY_NAMES.map((d) => (
                <div key={d} className="px-2 py-2 text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => (
                <DayCell key={d.toISOString()} date={d} inMonth={isSameMonth(d, month)} posts={byDay(d)} onOpen={(p) => setDraft(p)} onAdd={() => setDraft({ status: "draft", platform: "instagram", scheduled_date: format(d, "yyyy-MM-dd") })} />
              ))}
            </div>
          </div>

          {/* agenda (mobile) */}
          <div className="md:hidden flex flex-col gap-2">
            {days.filter((d) => isSameMonth(d, month) && byDay(d).length).length === 0 && (
              <div className="card p-6 text-center text-ink-2 text-sm">لا توجد منشورات مجدولة هذا الشهر</div>
            )}
            {days
              .filter((d) => isSameMonth(d, month) && byDay(d).length)
              .map((d) => (
                <div key={d.toISOString()} className="card p-3">
                  <div className={clsx("flex items-center gap-2 mb-2 font-extrabold", isToday(d) ? "text-ice-600" : "text-navy")}>
                    <span className="num text-[20px]">{format(d, "d")}</span>
                    <span className="text-sm">{format(d, "EEEE", { locale: ar })}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {byDay(d).map((p) => (
                      <PostChip key={p.id} post={p} onClick={() => setDraft(p)} full />
                    ))}
                  </div>
                </div>
              ))}
          </div>

          <div className="hidden lg:block">{tray}</div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {active?.kind === "post" && <div className="dragging"><PostChip post={active.item as Post} full /></div>}
        {active?.kind === "idea" && <div className="dragging"><IdeaChip idea={active.item as Idea} overlay /></div>}
      </DragOverlay>

      <PostModal draft={draft} onClose={() => setDraft(null)} />
    </DndContext>
  );
}

function DayCell({ date, inMonth, posts, onOpen, onAdd }: { date: Date; inMonth: boolean; posts: Post[]; onOpen: (p: Post) => void; onAdd: () => void }) {
  const id = `day-${format(date, "yyyy-MM-dd")}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  const today = isToday(date);
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "group min-h-[112px] border-b border-e border-silver-200 p-1.5 flex flex-col gap-1 transition-colors",
        !inMonth && "bg-silver-100/60",
        isOver && "bg-ice-50 ring-2 ring-inset ring-ice",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={clsx("num text-[13px] font-bold h-6 w-6 grid place-items-center rounded-full", today ? "bg-ice text-navy-900" : inMonth ? "text-navy" : "text-silver")}>{format(date, "d")}</span>
        <button onClick={onAdd} className="opacity-0 group-hover:opacity-100 text-ink-2 hover:text-navy p-0.5 rounded" aria-label="منشور جديد في هذا اليوم">
          <Plus size={14} />
        </button>
      </div>
      {posts.map((p) => (
        <PostChip key={p.id} post={p} onClick={() => onOpen(p)} />
      ))}
    </div>
  );
}

function PostChip({ post, onClick, full }: { post: Post; onClick?: () => void; full?: boolean }) {
  const { data } = useHub();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `post-${post.id}` });
  const assignee = post.assignee_id ? data.staff.find((s) => s.id === post.assignee_id) : null;
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={clsx(
        "w-full text-start rounded-lg border bg-white px-2 py-1.5 flex items-center gap-1.5 hover:border-ice transition touch-none",
        post.status === "published" ? "border-navy/30" : post.status === "review" ? "border-gold" : "border-silver-200",
        isDragging && "opacity-30",
      )}
      title={`${post.title} · ${formatLabel(post.format)}${post.scheduled_time ? " · " + post.scheduled_time.slice(0, 5) : ""}${assignee ? " · " + assignee.full_name : ""}`}
    >
      <PlatformChip platform={post.platform} className="px-1.5 text-[10px]" />
      <span className={clsx("flex-1 truncate font-bold text-navy", full ? "text-[13.5px]" : "text-[12.5px]")}>{post.title}</span>
      {full && post.scheduled_time && (
        <span className="num text-[11px] text-ink-2 flex items-center gap-0.5 shrink-0">
          <Clock size={10} /> {post.scheduled_time.slice(0, 5)}
        </span>
      )}
      {full && <StatusChip status={post.status} className="text-[10px] px-1.5" />}
      {full && assignee && <Avatar name={assignee.full_name} size={20} tone="light" />}
    </button>
  );
}

function IdeaChip({ idea, overlay }: { idea: Idea; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `idea-${idea.id}` });
  return (
    <div ref={overlay ? undefined : setNodeRef} {...(overlay ? {} : { ...attributes, ...listeners })} className={clsx("rounded-lg border border-gold-100 bg-gold-100/60 px-2.5 py-1.5 text-[13px] font-bold text-navy-900 cursor-grab active:cursor-grabbing touch-none flex items-center gap-1.5", isDragging && "opacity-30")}>
      <Lightbulb size={13} className="text-gold shrink-0" />
      <span className="truncate">{idea.title}</span>
    </div>
  );
}

function TrayZone({ id, icon, title, count, hint, children }: { id: string; icon: React.ReactNode; title: string; count: number; hint: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={clsx("card p-3 transition", isOver && "ring-2 ring-ice bg-ice-50")}>
      <div className="flex items-center gap-2 mb-1 text-navy font-extrabold text-[15px]">
        {icon} {title} <span className="num text-ink-2 text-sm font-bold">{count}</span>
      </div>
      <p className="text-ink-2 text-xs mb-2">{hint}</p>
      <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto min-h-10">{children}</div>
    </div>
  );
}
