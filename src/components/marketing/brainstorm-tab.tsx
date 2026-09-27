"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, ChevronUp, CalendarPlus, Archive, StickyNote, Sparkles, Check } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { useDndSensors } from "./dnd";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useHub } from "./store";
import PostModal, { type PostDraft } from "./post-modal";
import { EmptyState, Field, Modal, PlatformChip, PlatformSelect, Avatar } from "@/components/ui";
import { NOTE_COLORS, noteColorClass, type Idea, type NoteColor, type Platform } from "@/lib/types";

export default function BrainstormTab({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const { data, insert, update, remove, me } = useHub();
  const [quick, setQuick] = useState("");
  const [quickColor, setQuickColor] = useState<NoteColor>("ice");
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Idea> | null>(null);
  const [postDraft, setPostDraft] = useState<PostDraft | null>(null);

  const categories = useMemo(() => Array.from(new Set(data.ideas.map((i) => i.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ar")), [data.ideas]);
  const ideas = useMemo(() => (filter ? data.ideas.filter((i) => i.category === filter) : data.ideas), [data.ideas, filter]);

  const sensors = useDndSensors();

  async function addQuick(e: FormEvent) {
    e.preventDefault();
    if (!quick.trim()) return;
    await insert("ideas", { title: quick.trim(), color: quickColor, category: filter ?? "عام", position: -Date.now() });
    setQuick("");
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const next = arrayMove(ideas, ideas.findIndex((i) => i.id === active.id), ideas.findIndex((i) => i.id === over.id));
    await Promise.all(next.map((it, i) => (it.position !== i ? update("ideas", it.id, { position: i }) : null)));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const values = {
      title: editing.title?.trim() || "فكرة",
      body: editing.body ?? "",
      category: editing.category?.trim() || "عام",
      color: editing.color ?? "ice",
      platform: (editing.platform ?? "general") as Platform,
      is_note: !!editing.is_note,
    };
    if (editing.id) await update("ideas", editing.id, values);
    else await insert("ideas", { ...values, position: -Date.now() });
    setEditing(null);
  }

  function toPost(idea: Idea) {
    setPostDraft({
      title: idea.title,
      caption: idea.body,
      platform: idea.platform === "general" ? "instagram" : idea.platform,
      status: "idea",
      idea_id: idea.id,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={addQuick} className="card p-2 flex items-center gap-2">
        <Sparkles size={18} className="text-ice ms-2 shrink-0" />
        <input className="flex-1 bg-transparent outline-none text-[16px] py-2 placeholder:text-ink-2/60" placeholder="اكتب فكرة بسرعة واضغط Enter…" value={quick} onChange={(e) => setQuick(e.target.value)} />
        <div className="hidden sm:flex gap-1">
          {NOTE_COLORS.map((c) => (
            <button key={c.value} type="button" title={c.label} onClick={() => setQuickColor(c.value)} className={clsx("h-6 w-6 rounded-full border-2", c.cls, quickColor === c.value ? "border-navy" : "border-transparent")} />
          ))}
        </div>
        <button className="btn-primary h-9 px-3" aria-label="أضف">
          <Plus size={16} /> <span className="hidden sm:inline">أضف</span>
        </button>
        <button type="button" className="btn-outline h-9 px-2.5 sm:px-3" title="فكرة تفصيلية" onClick={() => setEditing({ title: "", body: "", category: filter ?? "عام", color: "ice", platform: "general" })}>
          <Pencil size={15} /> <span className="hidden sm:inline">تفصيلية</span>
        </button>
      </form>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <button onClick={() => setFilter(null)} className={clsx("chip px-3 py-1 text-[13px]", !filter ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
            الكل <span className="num">{data.ideas.length}</span>
          </button>
          {categories.map((c) => (
            <button key={c} onClick={() => setFilter(filter === c ? null : c)} className={clsx("chip px-3 py-1 text-[13px]", filter === c ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
              {c} <span className="num opacity-70">{data.ideas.filter((i) => i.category === c).length}</span>
            </button>
          ))}
        </div>
      )}

      {ideas.length === 0 ? (
        <EmptyState title="اللوحة فاضية" hint="اكتب أي فكرة تخطر ببالك — حتى الغريبة. الفرز يجي بعدين، والفكرة اللي تعجبكم تتحول لمنشور بضغطة." />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ideas.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {ideas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  authorName={data.staff.find((s) => s.id === idea.created_by)?.full_name ?? (idea.created_by === me.id ? me.name : "")}
                  onVote={() => update("ideas", idea.id, { votes: idea.votes + 1 })}
                  onEdit={() => setEditing(idea)}
                  onArchive={() => update("ideas", idea.id, { archived: true })}
                  onDelete={() => confirm("حذف الفكرة نهائياً؟") && remove("ideas", idea.id)}
                  onToPost={() => toPost(idea)}
                  onOpenCalendar={onOpenCalendar}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "تعديل الفكرة" : "فكرة جديدة"}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
              إلغاء
            </button>
            <button form="idea-form" className="btn-primary">
              حفظ
            </button>
          </>
        }
      >
        {editing && (
          <form id="idea-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="العنوان" className="sm:col-span-2">
              <input className="field" autoFocus value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required />
            </Field>
            <Field label="التفاصيل" className="sm:col-span-2">
              <textarea className="field min-h-28" value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
            </Field>
            <Field label="التصنيف">
              <input className="field" list="idea-categories" value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="مثال: ريلز، قصص الأهالي، عروض" />
              <datalist id="idea-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="المنصة">
              <PlatformSelect value={(editing.platform ?? "general") as Platform} onChange={(platform) => setEditing({ ...editing, platform })} />
            </Field>
            <Field label="اللون">
              <div className="flex gap-2 pt-1">
                {NOTE_COLORS.map((c) => (
                  <button key={c.value} type="button" title={c.label} onClick={() => setEditing({ ...editing, color: c.value })} className={clsx("h-8 w-8 rounded-full border-2", c.cls, editing.color === c.value ? "border-navy" : "border-transparent")} />
                ))}
              </div>
            </Field>
            <label className="flex items-center gap-3 self-end rounded-xl border border-silver-200 px-3.5 py-2.5 cursor-pointer">
              <input type="checkbox" checked={!!editing.is_note} onChange={(e) => setEditing({ ...editing, is_note: e.target.checked })} className="h-4 w-4 accent-[#1C2D5A]" />
              <span className="text-sm font-bold text-navy flex items-center gap-1.5">
                <StickyNote size={15} className="text-ice" /> ملاحظة (مو فكرة منشور)
              </span>
            </label>
          </form>
        )}
      </Modal>

      <PostModal draft={postDraft} onClose={() => setPostDraft(null)} />
    </div>
  );
}

function IdeaCard({
  idea,
  authorName,
  onVote,
  onEdit,
  onArchive,
  onDelete,
  onToPost,
  onOpenCalendar,
}: {
  idea: Idea;
  authorName: string;
  onVote: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToPost: () => void;
  onOpenCalendar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: idea.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx("group relative rounded-[14px] border p-4 pb-3 flex flex-col gap-2 min-h-[132px]", noteColorClass(idea.color), isDragging && "dragging z-10")}
    >
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-navy/40 hover:text-navy touch-none -ms-1 mt-0.5" aria-label="اسحب">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="4" cy="3" r="1.4"/><circle cx="10" cy="3" r="1.4"/><circle cx="4" cy="7" r="1.4"/><circle cx="10" cy="7" r="1.4"/><circle cx="4" cy="11" r="1.4"/><circle cx="10" cy="11" r="1.4"/></svg>
        </button>
        <div className="font-extrabold text-navy text-[16px] leading-snug flex-1">{idea.title}</div>
        {idea.is_note && <StickyNote size={15} className="text-navy/50 shrink-0 mt-0.5" />}
      </div>
      {idea.body && <p className="text-navy/80 text-sm leading-relaxed whitespace-pre-wrap">{idea.body}</p>}

      <div className="mt-auto pt-2 flex items-center gap-1.5 flex-wrap">
        <span className="chip bg-white/70 text-navy">{idea.category}</span>
        {idea.platform !== "general" && <PlatformChip platform={idea.platform} />}
        {idea.moved_post_id && (
          <button onClick={onOpenCalendar} className="chip bg-navy text-white" title="افتح التقويم">
            <Check size={12} /> تحوّلت لمنشور
          </button>
        )}
        <div className="ms-auto flex items-center gap-1">
          {authorName && <Avatar name={authorName} size={22} tone="white" />}
          <button onClick={onVote} className="flex items-center gap-0.5 rounded-full bg-white/80 hover:bg-white px-2 h-7 text-navy font-bold text-xs" title="أعجبتني">
            <ChevronUp size={14} /> <span className="num">{idea.votes}</span>
          </button>
        </div>
      </div>

      {/* actions: hover on desktop, always visible on touch */}
      <div className="reveal flex items-center gap-0.5 -mb-1.5 -mx-1.5 pt-1 border-t border-navy/10">
        {!idea.is_note && !idea.moved_post_id && (
          <button onClick={onToPost} className="h-8 px-2 rounded-md text-navy hover:bg-white/80 flex items-center gap-1 text-xs font-bold" title="حوّلها لمنشور في التقويم">
            <CalendarPlus size={15} /> للتقويم
          </button>
        )}
        <button onClick={onEdit} className="h-8 w-8 rounded-md text-navy hover:bg-white/80 grid place-items-center" title="تعديل" aria-label="تعديل">
          <Pencil size={15} />
        </button>
        <button onClick={onArchive} className="h-8 w-8 rounded-md text-navy hover:bg-white/80 grid place-items-center" title="أرشفة" aria-label="أرشفة">
          <Archive size={15} />
        </button>
        <button onClick={onDelete} className="h-8 w-8 rounded-md text-navy hover:bg-error-100 hover:text-error grid place-items-center ms-auto" title="حذف" aria-label="حذف">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
