"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  Inbox,
  Lightbulb,
  Clock,
  CalendarDays,
  CalendarRange,
  MessageCircle,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDndSensors } from "./dnd";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  addWeeks,
  isWithinInterval,
} from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { useHub } from "./store";
import { useMediaQuery } from "@/lib/use-media-query";
import PostModal, { type PostDraft } from "./post-modal";
import { PlatformChip, StatusChip, Avatar } from "@/components/ui";
import {
  PLATFORMS,
  formatLabel,
  type Idea,
  type Platform,
  type Post,
} from "@/lib/types";

const WEEK_START = 6; // Saturday
const DAY_NAMES = [
  "السبت",
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
];

function draftFromIdea(idea: Idea, date?: string): PostDraft {
  return {
    title: idea.title,
    caption: idea.body,
    platform: idea.platform === "general" ? "instagram" : idea.platform,
    status: "draft",
    scheduled_date: date ?? null,
    idea_id: idea.id,
  };
}

export default function CalendarTab() {
  const { data, update, insert } = useHub();
  const [view, setView] = useState<"month" | "week">("month");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [week, setWeek] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: WEEK_START }),
  );
  const [platformFilter, setPlatformFilter] = useState<Platform | null>(null);
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [active, setActive] = useState<{
    kind: "post" | "idea";
    item: Post | Idea;
  } | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);

  const sensors = useDndSensors({ keyboard: false });
  // phones get an agenda instead of the grid. Rendered exclusively (not CSS-hidden) so a post is never
  // registered twice as a draggable — duplicate ids break drag-and-drop.
  const isMd = useMediaQuery("(min-width: 768px)");

  const days = useMemo(
    () =>
      view === "week"
        ? eachDayOfInterval({
            start: week,
            end: endOfWeek(week, { weekStartsOn: WEEK_START }),
          })
        : eachDayOfInterval({
            start: startOfWeek(startOfMonth(month), {
              weekStartsOn: WEEK_START,
            }),
            end: endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_START }),
          }),
    [view, month, week],
  );
  const inRange = (d: Date) => (view === "week" ? true : isSameMonth(d, month));
  const weekEnd = endOfWeek(week, { weekStartsOn: WEEK_START });
  const rangeLabel =
    view === "week"
      ? isSameMonth(week, weekEnd)
        ? `${format(week, "d", { locale: ar })} – ${format(weekEnd, "d MMMM yyyy", { locale: ar })}`
        : `${format(week, "d MMMM", { locale: ar })} – ${format(weekEnd, "d MMMM yyyy", { locale: ar })}`
      : format(month, "LLLL yyyy", { locale: ar });
  function go(dir: -1 | 1) {
    if (view === "week") setWeek((w) => addWeeks(w, dir));
    else setMonth((m) => addMonths(m, dir));
  }
  function goToday() {
    setMonth(startOfMonth(new Date()));
    setWeek(startOfWeek(new Date(), { weekStartsOn: WEEK_START }));
  }

  const posts = useMemo(
    () =>
      platformFilter
        ? data.posts.filter((p) => p.platform === platformFilter)
        : data.posts,
    [data.posts, platformFilter],
  );
  const scheduled = posts.filter((p) => p.scheduled_date);
  const unscheduled = posts.filter((p) => !p.scheduled_date);
  const ideas = data.ideas.filter(
    (i) => !i.is_note && !i.moved_post_id && !i.archived,
  );
  const rangeCount = scheduled.filter((p) =>
    view === "week"
      ? isWithinInterval(parseISO(p.scheduled_date!), {
          start: week,
          end: weekEnd,
        })
      : isSameMonth(parseISO(p.scheduled_date!), month),
  ).length;

  const byDay = (d: Date) =>
    scheduled
      .filter((p) => isSameDay(parseISO(p.scheduled_date!), d))
      .sort(
        (a, b) =>
          (a.scheduled_time ?? "99").localeCompare(b.scheduled_time ?? "99") ||
          a.position - b.position,
      );

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
        if (post.scheduled_date)
          await update("posts", post.id, {
            scheduled_date: null,
            status: post.status === "scheduled" ? "approved" : post.status,
          });
      } else if (over.startsWith("day-")) {
        const date = over.slice(4);
        if (post.scheduled_date !== date) {
          // an approved post that gets a date becomes "scheduled"
          await update("posts", post.id, {
            scheduled_date: date,
            status: post.status === "approved" ? "scheduled" : post.status,
          });
        }
      }
    } else if (a.kind === "idea" && over.startsWith("day-")) {
      const idea = a.item as Idea;
      const created = await insert<Post>("posts", {
        ...draftFromIdea(idea, over.slice(4)),
        position: data.posts.length,
      });
      if (created)
        await update("ideas", idea.id, { moved_post_id: created.id });
    }
  }

  const tray = (
    <div className="flex flex-col gap-4">
      <TrayZone
        id="tray-unscheduled"
        icon={<Inbox size={16} className="text-ice" />}
        title="غير مجدول"
        count={unscheduled.length}
        hint="اسحب منشور هنا لإلغاء موعده"
      >
        {unscheduled.map((p) => (
          <PostChip key={p.id} post={p} onClick={() => setDraft(p)} full />
        ))}
      </TrayZone>
      <div className="card p-3">
        <div className="flex items-center gap-2 mb-1 text-navy font-extrabold text-[15px]">
          <Lightbulb size={16} className="text-gold" /> أفكار جاهزة للنقل{" "}
          <span className="num text-ink-2 text-sm font-bold">
            {ideas.length}
          </span>
        </div>
        <p className="text-ink-2 text-xs mb-2">
          <span className="hidden md:inline">اسحب الفكرة على أي يوم، أو </span>
          اضغط عليها لتحديد موعدها
        </p>
        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
          {ideas.length === 0 && (
            <p className="text-ink-2 text-sm text-center py-3">
              لا توجد أفكار غير منقولة
            </p>
          )}
          {ideas.map((i) => (
            <IdeaChip
              key={i.id}
              idea={i}
              onClick={() => setDraft(draftFromIdea(i))}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <DndContext
      id="calendar-dnd"
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="flex flex-col gap-4">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="card flex items-center p-1">
            <button
              onClick={() => go(-1)}
              className="h-10 w-10 grid place-items-center rounded-lg hover:bg-navy-50 text-navy"
              aria-label={view === "week" ? "الأسبوع السابق" : "الشهر السابق"}
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={goToday}
              className="px-3 h-10 font-extrabold text-navy min-w-36 text-center whitespace-nowrap"
              title="العودة لليوم"
            >
              {rangeLabel}
            </button>
            <button
              onClick={() => go(1)}
              className="h-10 w-10 grid place-items-center rounded-lg hover:bg-navy-50 text-navy"
              aria-label={view === "week" ? "الأسبوع التالي" : "الشهر التالي"}
            >
              <ChevronLeft size={18} />
            </button>
          </div>
          <div
            className="card flex items-center p-1"
            role="tablist"
            aria-label="طريقة العرض"
          >
            <button
              role="tab"
              aria-selected={view === "month"}
              onClick={() => setView("month")}
              className={clsx(
                "h-8 px-3 rounded-lg text-sm font-bold flex items-center gap-1.5",
                view === "month"
                  ? "bg-navy text-white"
                  : "text-navy hover:bg-navy-50",
              )}
            >
              <CalendarDays size={15} /> شهر
            </button>
            <button
              role="tab"
              aria-selected={view === "week"}
              onClick={() => {
                setWeek(
                  startOfWeek(
                    isSameMonth(new Date(), month) ? new Date() : month,
                    { weekStartsOn: WEEK_START },
                  ),
                );
                setView("week");
              }}
              className={clsx(
                "h-8 px-3 rounded-lg text-sm font-bold flex items-center gap-1.5",
                view === "week"
                  ? "bg-navy text-white"
                  : "text-navy hover:bg-navy-50",
              )}
            >
              <CalendarRange size={15} /> أسبوع
            </button>
          </div>
          <span className="text-ink-2 text-sm">
            <span className="num font-bold text-navy">{rangeCount}</span> منشور{" "}
            {view === "week" ? "هذا الأسبوع" : "هذا الشهر"}
          </span>
          <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
            <button
              onClick={() => setPlatformFilter(null)}
              className={clsx(
                "chip px-2.5 h-8",
                !platformFilter
                  ? "bg-navy text-white"
                  : "bg-white border border-silver-200 text-navy",
              )}
            >
              الكل
            </button>
            {PLATFORMS.filter((p) => p.value !== "general").map((p) => (
              <button
                key={p.value}
                onClick={() =>
                  setPlatformFilter(platformFilter === p.value ? null : p.value)
                }
                className={clsx(
                  "chip px-2.5 h-8 whitespace-nowrap",
                  platformFilter === p.value
                    ? "bg-navy text-white"
                    : "bg-white border border-silver-200 text-navy",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="ms-auto flex gap-2">
            <button
              className="btn-outline h-10 px-3 xl:hidden"
              onClick={() => setTrayOpen((o) => !o)}
              title="غير المجدول والأفكار"
            >
              <Inbox size={16} />{" "}
              <span className="num">{unscheduled.length}</span>
              {ideas.length > 0 && (
                <span className="num text-gold">+{ideas.length}</span>
              )}
            </button>
            <button
              className="btn-primary h-10 px-3"
              onClick={() =>
                setDraft({ status: "draft", platform: "instagram" })
              }
            >
              <Plus size={16} /> منشور
            </button>
          </div>
        </div>

        {trayOpen && <div className="xl:hidden">{tray}</div>}

        <div className="grid xl:grid-cols-[1fr_280px] gap-4 items-start">
          {/* month grid (md+) */}
          {isMd ? (
            <div className="card overflow-hidden">
              <div className="grid grid-cols-7 bg-navy text-white text-xs font-bold">
                {DAY_NAMES.map((d) => (
                  <div key={d} className="px-2 py-2 text-center">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((d) => (
                  <DayCell
                    key={d.toISOString()}
                    date={d}
                    inMonth={inRange(d)}
                    tall={view === "week"}
                    posts={byDay(d)}
                    onOpen={(p) => setDraft(p)}
                    onAdd={() =>
                      setDraft({
                        status: "draft",
                        platform: "instagram",
                        scheduled_date: format(d, "yyyy-MM-dd"),
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {days.filter((d) => inRange(d) && byDay(d).length).length ===
                0 && (
                <div className="card p-6 text-center text-ink-2 text-sm">
                  لا توجد منشورات مجدولة{" "}
                  {view === "week" ? "هذا الأسبوع" : "هذا الشهر"}
                </div>
              )}
              {days
                .filter((d) => inRange(d) && byDay(d).length)
                .map((d) => (
                  <div key={d.toISOString()} className="card p-3">
                    <div
                      className={clsx(
                        "flex items-center gap-2 mb-2 font-extrabold",
                        isToday(d) ? "text-ice-600" : "text-navy",
                      )}
                    >
                      <span className="num text-[20px]">{format(d, "d")}</span>
                      <span className="text-sm">
                        {format(d, "EEEE", { locale: ar })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {byDay(d).map((p) => (
                        <PostChip
                          key={p.id}
                          post={p}
                          onClick={() => setDraft(p)}
                          full
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div className="hidden xl:block">{tray}</div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {active?.kind === "post" && (
          <div className="dragging w-[220px]">
            <PostChipView post={active.item as Post} full />
          </div>
        )}
        {active?.kind === "idea" && (
          <div className="dragging w-[220px]">
            <IdeaChipView idea={active.item as Idea} />
          </div>
        )}
      </DragOverlay>

      <PostModal draft={draft} onClose={() => setDraft(null)} />
    </DndContext>
  );
}

function DayCell({
  date,
  inMonth,
  tall = false,
  posts,
  onOpen,
  onAdd,
}: {
  date: Date;
  inMonth: boolean;
  tall?: boolean;
  posts: Post[];
  onOpen: (p: Post) => void;
  onAdd: () => void;
}) {
  const id = `day-${format(date, "yyyy-MM-dd")}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  const today = isToday(date);
  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        // tapping the empty part of a day starts a new post on that day (handy on iPad)
        if (e.target === e.currentTarget) onAdd();
      }}
      className={clsx(
        "group border-b border-e border-silver-200 p-1.5 flex flex-col gap-1 transition-colors cursor-pointer",
        tall ? "min-h-[440px]" : "min-h-[112px]",
        !inMonth && "bg-silver-100/60",
        isOver && "bg-ice-50 ring-2 ring-inset ring-ice",
      )}
    >
      <div className="flex items-center justify-between pointer-events-none">
        <span
          className={clsx(
            "num text-[13px] font-bold h-6 w-6 grid place-items-center rounded-full",
            today
              ? "bg-ice text-navy-900"
              : inMonth
                ? "text-navy"
                : "text-silver",
          )}
        >
          {format(date, "d")}
        </span>
        {tall && (
          <span className="text-[11px] text-ink-2 font-bold me-auto ms-1.5">
            {format(date, "MMM", { locale: ar })}
          </span>
        )}
        <button
          onClick={onAdd}
          className="reveal pointer-events-auto hidden [@media(hover:hover)_and_(pointer:fine)]:grid text-ink-2 hover:text-navy h-7 w-7 -m-1 place-items-center rounded-md"
          aria-label="منشور جديد في هذا اليوم"
        >
          <Plus size={14} />
        </button>
      </div>
      {posts.map((p) => (
        <PostChip
          key={p.id}
          post={p}
          onClick={() => onOpen(p)}
          full={tall}
          stacked={tall}
        />
      ))}
    </div>
  );
}

/* ---------- chips: a hook-free view + a draggable wrapper (the DragOverlay must render the view only) ---------- */

function PostChipView({
  post,
  full,
  stacked,
  className,
}: {
  post: Post;
  full?: boolean;
  /** week view: a taller card with the details on their own row */
  stacked?: boolean;
  className?: string;
}) {
  const { data } = useHub();
  const assignee = post.assignee_id
    ? data.staff.find((s) => s.id === post.assignee_id)
    : null;
  const commentCount = data.comments.reduce(
    (n, c) => (c.post_id === post.id ? n + 1 : n),
    0,
  );
  const border =
    post.status === "published"
      ? "border-navy/30"
      : post.status === "review"
        ? "border-gold"
        : "border-silver-200";

  if (stacked) {
    return (
      <div
        className={clsx(
          "w-full text-start rounded-lg border bg-white px-2.5 py-2 flex flex-col gap-1.5 transition",
          border,
          className,
        )}
      >
        <div className="flex items-center gap-1.5">
          <PlatformChip
            platform={post.platform}
            className="px-1.5 text-[10px]"
          />
          <span className="text-ink-2 text-[11px] font-bold">
            {formatLabel(post.format)}
          </span>
          {post.scheduled_time && (
            <span className="num text-[11px] text-ink-2 flex items-center gap-0.5 ms-auto">
              <Clock size={10} /> {post.scheduled_time.slice(0, 5)}
            </span>
          )}
        </div>
        <span className="font-bold text-navy text-[13.5px] leading-snug line-clamp-3">
          {post.title}
        </span>
        <div className="flex items-center gap-1.5 mt-auto">
          <StatusChip status={post.status} className="text-[10px] px-1.5" />
          {commentCount > 0 && (
            <span className="num text-[11px] text-ink-2 flex items-center gap-0.5">
              <MessageCircle size={11} /> {commentCount}
            </span>
          )}
          {assignee && (
            <Avatar
              name={assignee.full_name}
              size={20}
              tone="light"
              className="ms-auto"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "w-full text-start rounded-lg border bg-white px-2 py-1.5 flex items-start gap-1.5 transition",
        border,
        className,
      )}
    >
      <PlatformChip
        platform={post.platform}
        className="px-1.5 text-[10px] mt-px"
      />
      <span
        className={clsx(
          "flex-1 font-bold text-navy leading-snug",
          full ? "text-[13.5px] truncate" : "text-[12.5px] line-clamp-2",
        )}
      >
        {post.title}
      </span>
      {full && post.scheduled_time && (
        <span className="num text-[11px] text-ink-2 flex items-center gap-0.5 shrink-0">
          <Clock size={10} /> {post.scheduled_time.slice(0, 5)}
        </span>
      )}
      {full && (
        <StatusChip status={post.status} className="text-[10px] px-1.5" />
      )}
      {full && assignee && (
        <Avatar name={assignee.full_name} size={20} tone="light" />
      )}
    </div>
  );
}

function PostChip({
  post,
  onClick,
  full,
  stacked,
}: {
  post: Post;
  onClick?: () => void;
  full?: boolean;
  stacked?: boolean;
}) {
  const { data } = useHub();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `post-${post.id}`,
  });
  const assignee = post.assignee_id
    ? data.staff.find((s) => s.id === post.assignee_id)
    : null;
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={clsx(
        "w-full text-start rounded-lg touch-manipulation select-none [-webkit-touch-callout:none] focus:outline-none focus-visible:ring-2 focus-visible:ring-ice",
        isDragging && "opacity-30",
      )}
      title={`${post.title} · ${formatLabel(post.format)}${post.scheduled_time ? " · " + post.scheduled_time.slice(0, 5) : ""}${assignee ? " · " + assignee.full_name : ""}`}
    >
      <PostChipView
        post={post}
        full={full}
        stacked={stacked}
        className="hover:border-ice"
      />
    </button>
  );
}

function IdeaChipView({ idea, className }: { idea: Idea; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-gold-100 bg-gold-100/60 px-2.5 py-2 text-[13px] font-bold text-navy-900 flex items-center gap-1.5",
        className,
      )}
    >
      <Lightbulb size={13} className="text-gold shrink-0" />
      <span className="truncate">{idea.title}</span>
    </div>
  );
}

function IdeaChip({ idea, onClick }: { idea: Idea; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `idea-${idea.id}`,
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={clsx(
        "w-full text-start cursor-grab active:cursor-grabbing touch-manipulation select-none [-webkit-touch-callout:none] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ice",
        isDragging && "opacity-30",
      )}
      title="اضغط لتحديد الموعد أو اسحب إلى يوم"
    >
      <IdeaChipView idea={idea} className="hover:border-gold" />
    </button>
  );
}

function TrayZone({
  id,
  icon,
  title,
  count,
  hint,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  count: number;
  hint: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "card p-3 transition",
        isOver && "ring-2 ring-ice bg-ice-50",
      )}
    >
      <div className="flex items-center gap-2 mb-1 text-navy font-extrabold text-[15px]">
        {icon} {title}{" "}
        <span className="num text-ink-2 text-sm font-bold">{count}</span>
      </div>
      <p className="text-ink-2 text-xs mb-2 hidden md:block">{hint}</p>
      <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto min-h-10">
        {children}
      </div>
    </div>
  );
}
