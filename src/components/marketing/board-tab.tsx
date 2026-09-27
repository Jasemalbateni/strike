"use client";

import { useState } from "react";
import { Plus, Clock, CalendarDays, CheckCheck } from "lucide-react";
import { DndContext, DragOverlay, closestCorners, useDroppable, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { useDndSensors } from "./dnd";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
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

  const sensors = useDndSensors();

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
    const list = inCol(target).filter((p) => p.id !== id);
    const overIdx = list.findIndex((p) => p.id === String(e.over!.id));
    const insertAt = overIdx === -1 ? list.length : overIdx;
    list.splice(insertAt, 0, { ...post, status: target });
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
        <p className="text-ink-2 text-sm">اسحب البطاقة بين الأعمدة لتغيير حالتها. البطاقات الصفراء بانتظار اعتماد {me.isOwner ? "منك" : "المالك"}.</p>
        <button className="btn-primary h-9 px-3 shrink-0" onClick={() => setDraft({ status: "idea", platform: "instagram" })}>
          <Plus size={16} /> بطاقة
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); setHover(null); }}>
        <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
          {STATUSES.map((s) => (
            <Column key={s.value} status={s.value} label={s.label} posts={inCol(s.value)} highlight={hover === s.value} onOpen={(p) => setDraft(p)} onAdd={() => setDraft({ status: s.value, platform: "instagram" })} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{activePost && <div className="dragging w-[260px]"><Card post={activePost} overlay /></div>}</DragOverlay>
      </DndContext>

      <PostModal draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}

function Column({ status, label, posts, highlight, onOpen, onAdd }: { status: PostStatus; label: string; posts: Post[]; highlight: boolean; onOpen: (p: Post) => void; onAdd: () => void }) {
  const { setNodeRef } = useDroppable({ id: `col-${status}` });
  return (
    <div ref={setNodeRef} className={clsx("card border-t-4 w-[272px] shrink-0 snap-start flex flex-col max-h-[calc(100dvh-260px)] min-h-[320px] transition", COL_STYLE[status], highlight && "ring-2 ring-ice")}>
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="font-extrabold text-navy text-[15px] flex items-center gap-2">
          {label} <span className="num text-ink-2 text-sm font-bold">{posts.length}</span>
        </div>
        <button onClick={onAdd} className="p-1 rounded-md text-ink-2 hover:bg-navy-50 hover:text-navy" aria-label="إضافة">
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

function Card({ post, onClick, overlay }: { post: Post; onClick?: () => void; overlay?: boolean }) {
  const { data } = useHub();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: post.id, disabled: overlay });
  const assignee = post.assignee_id ? data.staff.find((s) => s.id === post.assignee_id) : null;
  const campaign = post.campaign_id ? data.plan.find((c) => c.id === post.campaign_id) : null;
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : { transform: CSS.Transform.toString(transform), transition }}
      {...(overlay ? {} : { ...attributes, ...listeners })}
      onClick={onClick}
      className={clsx("rounded-xl border border-silver-200 bg-white p-3 flex flex-col gap-2 cursor-grab active:cursor-grabbing touch-manipulation select-none [-webkit-touch-callout:none] hover:border-ice transition", isDragging && "opacity-30")}
    >
      <div className="flex items-center gap-1.5">
        <PlatformChip platform={post.platform} />
        <span className="text-ink-2 text-[11px] font-bold">{formatLabel(post.format)}</span>
        {post.status === "published" && <CheckCheck size={14} className="text-ice-600 ms-auto" />}
      </div>
      <div className="font-bold text-navy text-[14px] leading-snug">{post.title}</div>
      {campaign && <span className="chip bg-navy-50 text-navy self-start">{campaign.title}</span>}
      <div className="flex items-center gap-2 text-ink-2 text-[11.5px]">
        {post.scheduled_date && (
          <span className="num flex items-center gap-1">
            <CalendarDays size={12} /> {format(new Date(post.scheduled_date), "d MMM", { locale: ar })}
          </span>
        )}
        {post.scheduled_time && (
          <span className="num flex items-center gap-1">
            <Clock size={12} /> {post.scheduled_time.slice(0, 5)}
          </span>
        )}
        {assignee && <Avatar name={assignee.full_name} size={22} tone="light" className="ms-auto" />}
      </div>
    </div>
  );
}
