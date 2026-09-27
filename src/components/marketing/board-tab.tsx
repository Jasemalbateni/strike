"use client";

import { useState } from "react";
import { Plus, Clock, CalendarDays, CheckCheck, MessageCircle } from "lucide-react";
import { DndContext, DragOverlay, closestCorners, useDroppable, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { useDndSensors } from "./dnd";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { useHub } from "./store";
import PostModal, { type PostDraft } from "./post-modal";
import { PlatformChip, Avatar } from "@/components/ui";
import { STATUSES, formatLabel, type Post, type PostStatus } from "@/lib/types";

const COL_STYLE: Record<PostStatus, string> = {
  idea: "border-t-silver",
  draft: "border-t-navy-100",
  review: "border-t-gold",
  approved: "border-t-ice",
  scheduled: "border-t-ice-600",
  published: "border-t-navy",
};

export default function BoardTab() {
  const { data, update, me } = useHub();
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hover, setHover] = useState<PostStatus | null>(null);

  const sensors = useDndSensors({ keyboard: false });

  const colOf = (id: string): PostStatus | null => {
    if (id.startsWith("col-")) return id.slice(4) as PostStatus;
    return data.posts.find((p) => p.id === id)?.status ?? null;
  };
  const inCol = (s: PostStatus) => data.posts.filter((p) => p.status === s).sort((a, b) => a.position - b.position);

  function onDragOver(e: DragOverEvent) {
    setHover(e.over ? colOf(String(e.over.id)) : null);
  }

  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    setActiveId(null);
    setHover(null);
    if (!e.over) return;
    const post = data.posts.find((p) => p.id === id);
    const target = colOf(String(e.over.id));
    if (!post || !target) return;
    const overId = String(e.over.id);

    let list: Post[];
    if (target === post.status) {
      // same column: mirror the sortable preview exactly
      const col = inCol(target);
      const from = col.findIndex((p) => p.id === id);
      const to = overId.startsWith("col-") ? col.length - 1 : col.findIndex((p) => p.id === overId);
      if (from === -1 || to === -1 || from === to) return;
      list = arrayMove(col, from, to);
    } else {
      list = inCol(target);
      const overIdx = list.findIndex((p) => p.id === overId);
      list.splice(overIdx === -1 ? list.length : overIdx, 0, { ...post, status: target });
    }
    await Promise.all(
      list.map((p, i) => {
        const changed = p.position !== i || p.status !== target;
        return changed ? update("posts", p.id, { position: i, status: target }) : null;
      }),
    );
  }

  const activePost = activeId ? data.posts.find((p) => p.id === activeId) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-ink-2 text-sm">
          <span className="hidden sm:inline">اسحب البطاقة بين الأعمدة لتغيير حالتها. </span>
          البطاقات الصفراء بانتظار اعتماد {me.isOwner ? "منك" : "المالك"}.
        </p>
        <button className="btn-primary h-10 px-3 shrink-0" onClick={() => setDraft({ status: "idea", platform: "instagram" })}>
          <Plus size={16} /> بطاقة
        </button>
      </div>

      <DndContext
        id="board-dnd"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setHover(null);
        }}
      >
        <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
          {STATUSES.map((s) => (
            <Column key={s.value} status={s.value} label={s.label} posts={inCol(s.value)} highlight={hover === s.value} onOpen={(p) => setDraft(p)} onAdd={() => setDraft({ status: s.value, platform: "instagram" })} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activePost && (
            <div className="dragging w-[260px]">
              <CardView post={activePost} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <PostModal draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}

function Column({ status, label, posts, highlight, onOpen, onAdd }: { status: PostStatus; label: string; posts: Post[]; highlight: boolean; onOpen: (p: Post) => void; onAdd: () => void }) {
  const { setNodeRef } = useDroppable({ id: `col-${status}` });
  return (
    <div ref={setNodeRef} className={clsx("card border-t-4 w-[272px] shrink-0 snap-start flex flex-col max-h-[calc(100dvh-260px)] min-h-[320px] transition", COL_STYLE[status], highlight && "ring-2 ring-ice")}>
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <div className="font-extrabold text-navy text-[15px] flex items-center gap-2">
          {label} <span className="num text-ink-2 text-sm font-bold">{posts.length}</span>
        </div>
        <button onClick={onAdd} className="h-9 w-9 -me-2 grid place-items-center rounded-md text-ink-2 hover:bg-navy-50 hover:text-navy" aria-label={`إضافة بطاقة في ${label}`}>
          <Plus size={16} />
        </button>
      </div>
      <SortableContext items={posts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-2">
          {posts.length === 0 && <div className="text-ink-2 text-xs text-center border border-dashed border-silver rounded-xl py-6 mx-1">اسحب هنا</div>}
          {posts.map((p) => (
            <Card key={p.id} post={p} onClick={() => onOpen(p)} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

/** hook-free card body (used by the sortable card and by the DragOverlay) */
function CardView({ post, className }: { post: Post; className?: string }) {
  const { data } = useHub();
  const assignee = post.assignee_id ? data.staff.find((s) => s.id === post.assignee_id) : null;
  const campaign = post.campaign_id ? data.plan.find((c) => c.id === post.campaign_id) : null;
  const commentCount = data.comments.reduce((n, c) => (c.post_id === post.id ? n + 1 : n), 0);
  return (
    <div className={clsx("rounded-xl border border-silver-200 bg-white p-3 flex flex-col gap-2 transition", className)}>
      <div className="flex items-center gap-1.5">
        <PlatformChip platform={post.platform} />
        <span className="text-ink-2 text-[11px] font-bold">{formatLabel(post.format)}</span>
        {post.status === "published" && <CheckCheck size={14} className="text-ice-600 ms-auto" />}
      </div>
      <div className="font-bold text-navy text-[14px] leading-snug">{post.title}</div>
      {campaign && <span className="chip bg-navy-50 text-navy self-start">{campaign.title}</span>}
      <div className="flex items-center gap-2 text-ink-2 text-[11.5px] min-h-5">
        {post.scheduled_date && (
          <span className="num flex items-center gap-1">
            <CalendarDays size={12} /> {format(parseISO(post.scheduled_date), "d MMM", { locale: ar })}
          </span>
        )}
        {post.scheduled_time && (
          <span className="num flex items-center gap-1">
            <Clock size={12} /> {post.scheduled_time.slice(0, 5)}
          </span>
        )}
        {commentCount > 0 && (
          <span className="num flex items-center gap-0.5" title="تعليقات">
            <MessageCircle size={12} /> {commentCount}
          </span>
        )}
        {assignee && <Avatar name={assignee.full_name} size={22} tone="light" className="ms-auto" />}
      </div>
    </div>
  );
}

function Card({ post, onClick }: { post: Post; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: post.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={clsx("cursor-grab active:cursor-grabbing touch-manipulation select-none [-webkit-touch-callout:none] rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ice", isDragging && "opacity-30")}
    >
      <CardView post={post} className="hover:border-ice" />
    </div>
  );
}
