"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, ChevronUp, CalendarPlus, Archive, ArchiveRestore, StickyNote, Sparkles, Check, Search } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { useDndSensors } from "./dnd";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useHub } from "./store";
import PostModal, { type PostDraft } from "./post-modal";
import { EmptyState, Field, Modal, PlatformChip, PlatformSelect, Avatar } from "@/components/ui";
import { NOTE_COLORS, noteColorClass, type Idea, type NoteColor, type Platform } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

export default function BrainstormTab({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const { data, insert, update, remove, rpc, me, notify } = useHub();
  const [quick, setQuick] = useState("");
  const [quickColor, setQuickColor] = useState<NoteColor>("ice");
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Idea> | null>(null);
  const [postDraft, setPostDraft] = useState<PostDraft | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [archived, setArchived] = useState<Idea[] | null>(null);

  const categories = useMemo(() => Array.from(new Set(data.ideas.map((i) => i.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ar")), [data.ideas]);
  const q = search.trim().toLowerCase();
  const ideas = useMemo(
    () => data.ideas.filter((i) => (!filter || i.category === filter) && (!q || i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q))),
    [data.ideas, filter, q],
  );
  const filtered = !!filter || !!q;

  const sensors = useDndSensors();

  // next "first" position: smaller than everything on the board
  const topPosition = () => Math.min(0, ...data.ideas.map((i) => i.position)) - 1;

  async function addQuick(e: FormEvent) {
    e.preventDefault();
    if (!quick.trim()) return;
    const row = await insert("ideas", { title: quick.trim(), color: quickColor, category: filter ?? "عام", position: topPosition() });
    if (row) setQuick("");
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // reorder against the FULL board so a filtered view never scrambles the rest
    const full = data.ideas;
    const next = arrayMove(full, full.findIndex((i) => i.id === active.id), full.findIndex((i) => i.id === over.id));
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
    const ok = editing.id ? await update("ideas", editing.id, values) : !!(await insert("ideas", { ...values, position: topPosition() }));
    if (ok) setEditing(null);
  }

  async function vote(idea: Idea) {
    const votes = await rpc<number>("mk_vote_idea", { p_id: idea.id });
    if (votes !== null) await update("ideas", idea.id, { votes }); // local echo (realtime confirms)
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

  // archive view (loaded on demand — archived ideas are not part of the live board)
  useEffect(() => {
    if (!showArchive) return;
    let cancelled = false;
    createClient()
      .from("mk_ideas")
      .select("*")
      .eq("archived", true)
      .order("updated_at", { ascending: false })
      .limit(100)
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        if (error) notify("تعذر تحميل الأرشيف");
        setArchived((rows ?? []) as Idea[]);
      });
    return () => {
      cancelled = true;
    };
  }, [showArchive, notify]);

  async function restore(idea: Idea) {
    const { error } = await createClient().from("mk_ideas").update({ archived: false, position: topPosition() }).eq("id", idea.id);
    if (error) return notify("تعذر الاستعادة");
    setArchived((a) => (a ?? []).filter((i) => i.id !== idea.id));
    // realtime brings it back to the board; if disconnected, a refresh will
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={addQuick} className="card p-2 flex items-center gap-2">
        <Sparkles size={18} className="text-ice ms-2 shrink-0" />
        <input className="flex-1 min-w-0 bg-transparent outline-none text-[16px] py-2 placeholder:text-ink-2/60" placeholder="اكتب فكرة بسرعة واضغط Enter…" value={quick} onChange={(e) => setQuick(e.target.value)} />
        <div className="flex gap-1">
          {NOTE_COLORS.map((c) => (
            <button key={c.value} type="button" title={c.label} aria-label={`لون ${c.label}`} onClick={() => setQuickColor(c.value)} className={clsx("h-7 w-7 sm:h-6 sm:w-6 rounded-full border-2", c.cls, quickColor === c.value ? "border-navy" : "border-transparent")} />
          ))}
        </div>
        <button className="btn-primary h-10 px-3" aria-label="أضف">
          <Plus size={16} /> <span className="hidden sm:inline">أضف</span>
        </button>
        <button type="button" className="btn-outline h-10 px-2.5 sm:px-3" title="فكرة تفصيلية" onClick={() => setEditing({ title: "", body: "", category: filter ?? "عام", color: "ice", platform: "general" })}>
          <Pencil size={15} /> <span className="hidden sm:inline">تفصيلية</span>
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5 items-center">
        <button onClick={() => setFilter(null)} className={clsx("chip px-3 h-8 text-[13px]", !filter ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
          الكل <span className="num">{data.ideas.length}</span>
        </button>
        {categories.map((c) => (
          <button key={c} onClick={() => setFilter(filter === c ? null : c)} className={clsx("chip px-3 h-8 text-[13px]", filter === c ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
            {c} <span className="num opacity-70">{data.ideas.filter((i) => i.category === c).length}</span>
          </button>
        ))}
        <label className="ms-auto flex items-center gap-1.5 rounded-full bg-white border border-silver-200 px-3 h-8 min-w-[160px]">
          <Search size={14} className="text-ink-2 shrink-0" />
          <input className="bg-transparent outline-none text-sm w-full" placeholder="بحث" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button onClick={() => setShowArchive((v) => !v)} className={clsx("chip px-3 h-8 text-[13px]", showArchive ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
          <Archive size={13} /> الأرشيف
        </button>
      </div>

      {showArchive && (
        <div className="card p-3 fade-up">
          <div className="text-navy font-extrabold text-[15px] mb-2">الأفكار المؤرشفة</div>
          {archived === null ? (
            <p className="text-ink-2 text-sm">جارٍ التحميل…</p>
          ) : archived.length === 0 ? (
            <p className="text-ink-2 text-sm">الأرشيف فاضي</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {archived.map((i) => (
                <li key={i.id} className="flex items-center gap-2 rounded-lg border border-silver-200 px-3 py-2">
                  <span className="font-bold text-navy text-sm flex-1 truncate">{i.title}</span>
                  <span className="chip bg-silver-100 text-ink-2">{i.category}</span>
                  <button onClick={() => restore(i)} className="btn-outline h-9 px-2.5 text-xs" title="استعادة إلى اللوحة">
                    <ArchiveRestore size={14} /> استعادة
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {ideas.length === 0 ? (
        <EmptyState title={filtered ? "لا توجد نتائج" : "اللوحة فاضية"} hint={filtered ? "جرّب كلمة أو تصنيف ثاني." : "اكتب أي فكرة تخطر ببالك — حتى الغريبة. الفرز يجي بعدين، والفكرة اللي تعجبكم تتحول لمنشور بضغطة."} />
      ) : (
        <DndContext id="ideas-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ideas.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {ideas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  authorName={data.staff.find((s) => s.id === idea.created_by)?.full_name ?? (idea.created_by === me.id ? me.name : "")}
                  onVote={() => vote(idea)}
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
                  <button key={c.value} type="button" title={c.label} aria-label={`لون ${c.label}`} onClick={() => setEditing({ ...editing, color: c.value })} className={clsx("h-9 w-9 rounded-full border-2", c.cls, editing.color === c.value ? "border-navy" : "border-transparent")} />
                ))}
              </div>
            </Field>
            <label className="flex items-center gap-3 self-end rounded-xl border border-silver-200 px-3.5 min-h-11 cursor-pointer">
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
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: idea.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx("group relative rounded-[14px] border p-4 pb-3 flex flex-col gap-2 min-h-[132px]", noteColorClass(idea.color), isDragging && "dragging z-10")}
    >
      <div className="flex items-start gap-1">
        <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-navy/40 hover:text-navy touch-none -ms-2 -mt-1.5 h-9 w-9 grid place-items-center rounded-md" aria-label="اسحب لإعادة الترتيب">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden><circle cx="4" cy="3" r="1.4"/><circle cx="10" cy="3" r="1.4"/><circle cx="4" cy="7" r="1.4"/><circle cx="10" cy="7" r="1.4"/><circle cx="4" cy="11" r="1.4"/><circle cx="10" cy="11" r="1.4"/></svg>
        </button>
        <div className="font-extrabold text-navy text-[16px] leading-snug flex-1 pt-0.5">{idea.title}</div>
        {idea.is_note && <StickyNote size={15} className="text-navy/50 shrink-0 mt-1" />}
      </div>
      {idea.body && <p className="text-navy/80 text-sm leading-relaxed whitespace-pre-wrap">{idea.body}</p>}

      <div className="mt-auto pt-2 flex items-center gap-1.5 flex-wrap">
        <span className="chip bg-white/70 text-navy">{idea.category}</span>
        {idea.platform !== "general" && <PlatformChip platform={idea.platform} />}
        {idea.moved_post_id && (
          <button onClick={onOpenCalendar} className="chip bg-navy text-white h-7" title="افتح التقويم">
            <Check size={12} /> تحوّلت لمنشور
          </button>
        )}
        <div className="ms-auto flex items-center gap-1">
          {authorName && <Avatar name={authorName} size={22} tone="white" />}
          <button onClick={onVote} className="flex items-center gap-0.5 rounded-full bg-white/80 hover:bg-white px-2.5 h-8 text-navy font-bold text-xs" title="أعجبتني">
            <ChevronUp size={14} /> <span className="num">{idea.votes}</span>
          </button>
        </div>
      </div>

      {/* actions: hover on desktop, always visible on touch */}
      <div className="reveal flex items-center gap-0.5 -mb-1.5 -mx-1.5 pt-1 border-t border-navy/10">
        {!idea.is_note && !idea.moved_post_id && (
          <button onClick={onToPost} className="h-9 px-2 rounded-md text-navy hover:bg-white/80 flex items-center gap-1 text-xs font-bold" title="حوّلها لمنشور في التقويم">
            <CalendarPlus size={15} /> للتقويم
          </button>
        )}
        <button onClick={onEdit} className="h-9 w-9 rounded-md text-navy hover:bg-white/80 grid place-items-center" title="تعديل" aria-label="تعديل">
          <Pencil size={15} />
        </button>
        <button onClick={onArchive} className="h-9 w-9 rounded-md text-navy hover:bg-white/80 grid place-items-center" title="أرشفة" aria-label="أرشفة">
          <Archive size={15} />
        </button>
        <button onClick={onDelete} className="h-9 w-9 rounded-md text-navy hover:bg-error-100 hover:text-error grid place-items-center ms-auto" title="حذف" aria-label="حذف">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
