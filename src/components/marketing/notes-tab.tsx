"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Plus,
  Pin,
  PinOff,
  Check,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  Search,
  StickyNote,
  ChevronDown,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { useHub } from "./store";
import { useConfirm } from "@/components/confirm";
import { EmptyState, Field, Modal, Avatar } from "@/components/ui";
import { NOTE_COLORS, noteColorClass, type Note } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

type Draft = Partial<Note>;

/** "الآن" for the first minute, then "قبل X" */
function ago(iso: string) {
  const d = new Date(iso);
  const txt = formatDistanceToNowStrict(d, { locale: ar, unit: undefined });
  return /ثاني|ثوان|second/.test(txt) ? "الآن" : "قبل " + txt;
}

export default function NotesTab() {
  const { data, insert, update, remove, notify } = useHub();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(true);
  const [showArchive, setShowArchive] = useState(false);
  const [archived, setArchived] = useState<Note[] | null>(null);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(data.notes.map((n) => n.category).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "ar")),
    [data.notes],
  );
  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      data.notes.filter(
        (n) =>
          (!filter || n.category === filter) &&
          (!q ||
            n.title.toLowerCase().includes(q) ||
            n.body.toLowerCase().includes(q)),
      ),
    [data.notes, filter, q],
  );
  const pinned = visible.filter((n) => n.pinned && !n.done);
  const active = visible.filter((n) => !n.pinned && !n.done);
  const done = visible.filter((n) => n.done);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const values = {
      title: editing.title?.trim() || "ملاحظة",
      body: editing.body ?? "",
      category: editing.category?.trim() || "عام",
      color: editing.color ?? "white",
    };
    const ok = editing.id
      ? await update("notes", editing.id, values)
      : !!(await insert("notes", { ...values, pinned: !!editing.pinned }));
    if (ok) setEditing(null);
  }

  useEffect(() => {
    if (!showArchive) return;
    let cancelled = false;
    createClient()
      .from("mk_notes")
      .select("*")
      .eq("archived", true)
      .order("updated_at", { ascending: false })
      .limit(200)
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        if (error) notify("تعذر تحميل الأرشيف");
        setArchived((rows ?? []) as Note[]);
      });
    return () => {
      cancelled = true;
    };
  }, [showArchive, notify]);

  async function restore(n: Note) {
    const { error } = await createClient()
      .from("mk_notes")
      .update({ archived: false, done: false })
      .eq("id", n.id);
    if (error) return notify("تعذر الاستعادة");
    setArchived((a) => (a ?? []).filter((x) => x.id !== n.id));
  }

  async function purge(n: Note) {
    if (
      !(await confirm({
        title: "حذف الملاحظة نهائياً؟",
        message: `«${n.title}» بتنحذف من الأرشيف.`,
      }))
    )
      return;
    const { error } = await createClient()
      .from("mk_notes")
      .delete()
      .eq("id", n.id);
    if (error) return notify("تعذر الحذف");
    setArchived((a) => (a ?? []).filter((x) => x.id !== n.id));
  }

  const card = (n: Note) => (
    <NoteCard
      key={n.id}
      note={n}
      onEdit={() => setEditing(n)}
      onPin={() => update("notes", n.id, { pinned: !n.pinned })}
      onDone={() =>
        update("notes", n.id, {
          done: !n.done,
          pinned: n.done ? n.pinned : false,
        })
      }
      onArchive={() => update("notes", n.id, { archived: true })}
      onDelete={async () =>
        (await confirm({
          title: "حذف الملاحظة نهائياً؟",
          message: "إذا تبي ترجع لها لاحقاً استخدم الأرشفة بدل الحذف.",
        })) && remove("notes", n.id)
      }
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-primary h-10 px-3"
          onClick={() =>
            setEditing({
              title: "",
              body: "",
              category: filter ?? "عام",
              color: "white",
            })
          }
        >
          <Plus size={16} /> ملاحظة جديدة
        </button>
        <label className="flex items-center gap-1.5 rounded-full bg-white border border-silver-200 px-3 h-10 min-w-[180px] flex-1 sm:flex-none">
          <Search size={14} className="text-ink-2 shrink-0" />
          <input
            className="bg-transparent outline-none text-sm w-full"
            placeholder="بحث في الملاحظات"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] max-w-full">
          <button
            onClick={() => setFilter(null)}
            className={clsx(
              "chip px-3 h-8 text-[13px] whitespace-nowrap",
              !filter
                ? "bg-navy text-white"
                : "bg-white border border-silver-200 text-navy hover:border-ice",
            )}
          >
            الكل <span className="num">{data.notes.length}</span>
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(filter === c ? null : c)}
              className={clsx(
                "chip px-3 h-8 text-[13px] whitespace-nowrap",
                filter === c
                  ? "bg-navy text-white"
                  : "bg-white border border-silver-200 text-navy hover:border-ice",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowArchive((v) => !v)}
          className={clsx(
            "chip px-3 h-8 text-[13px] ms-auto",
            showArchive
              ? "bg-navy text-white"
              : "bg-white border border-silver-200 text-navy hover:border-ice",
          )}
        >
          <Archive size={13} /> الأرشيف
        </button>
      </div>

      {showArchive && (
        <div className="card p-3 fade-up">
          <div className="text-navy font-extrabold text-[15px] mb-2">
            الملاحظات المؤرشفة
          </div>
          {archived === null ? (
            <p className="text-ink-2 text-sm">جارٍ التحميل…</p>
          ) : archived.length === 0 ? (
            <p className="text-ink-2 text-sm">الأرشيف فاضي</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {archived.map((n) => (
                <li
                  key={n.id}
                  className="flex items-center gap-2 rounded-lg border border-silver-200 px-3 py-2"
                >
                  <span className="font-bold text-navy text-sm flex-1 truncate">
                    {n.title}
                  </span>
                  <span className="chip bg-silver-100 text-ink-2">
                    {n.category}
                  </span>
                  <button
                    onClick={() => restore(n)}
                    className="btn-outline h-9 px-2.5 text-xs"
                    title="استعادة"
                  >
                    <ArchiveRestore size={14} /> استعادة
                  </button>
                  <button
                    onClick={() => purge(n)}
                    className="h-9 w-9 grid place-items-center rounded-lg text-ink-2 hover:bg-error-100 hover:text-error"
                    aria-label="حذف نهائي"
                    title="حذف نهائي"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={q || filter ? "لا توجد نتائج" : "ما فيه ملاحظات بعد"}
          hint={
            q || filter
              ? "جرّب كلمة أو تصنيف ثاني."
              : "سجّل أي شي تبي ترجع له: قرارات الاجتماع، أرقام مهمة، أفكار للتنفيذ. ثبّت المهم، وعلّم «تم» على اللي خلصت منه."
          }
          action={
            !q && !filter ? (
              <button
                className="btn-accent"
                onClick={() =>
                  setEditing({
                    title: "",
                    body: "",
                    category: "عام",
                    color: "white",
                  })
                }
              >
                <Plus size={18} /> أضف أول ملاحظة
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {pinned.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 text-ink-2 text-xs font-bold mb-2">
                <Pin size={13} className="text-gold" /> مثبتة{" "}
                <span className="num">{pinned.length}</span>
              </div>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {pinned.map(card)}
              </div>
            </section>
          )}
          {active.length > 0 && (
            <section>
              {pinned.length > 0 && (
                <div className="flex items-center gap-1.5 text-ink-2 text-xs font-bold mb-2">
                  <StickyNote size={13} /> ملاحظات{" "}
                  <span className="num">{active.length}</span>
                </div>
              )}
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {active.map(card)}
              </div>
            </section>
          )}
          {done.length > 0 && (
            <section>
              <button
                onClick={() => setShowDone((v) => !v)}
                className="flex items-center gap-1.5 text-ink-2 text-xs font-bold mb-2 h-8"
              >
                <Check size={13} className="text-ice-600" /> منتهية{" "}
                <span className="num">{done.length}</span>
                <ChevronDown
                  size={14}
                  className={clsx("transition", !showDone && "-rotate-90")}
                />
              </button>
              {showDone && (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 opacity-80">
                  {done.map(card)}
                </div>
              )}
            </section>
          )}
        </>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "تعديل الملاحظة" : "ملاحظة جديدة"}
        wide
        footer={
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setEditing(null)}
            >
              إلغاء
            </button>
            <button form="note-form" className="btn-primary">
              حفظ
            </button>
          </>
        }
      >
        {editing && (
          <form
            id="note-form"
            onSubmit={save}
            className="grid gap-4 sm:grid-cols-3"
          >
            <Field label="العنوان" className="sm:col-span-3">
              <input
                className="field font-bold"
                autoFocus={!editing.id}
                value={editing.title ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
                placeholder="مثال: قرارات اجتماع الأحد"
                required
              />
            </Field>
            <Field label="النص" className="sm:col-span-3">
              <textarea
                className="field min-h-52 leading-relaxed"
                value={editing.body ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, body: e.target.value })
                }
                placeholder="اكتب بحرية… كل سطر يبدأ بـ - يظهر كنقطة"
              />
            </Field>
            <Field label="التصنيف">
              <input
                className="field"
                list="note-categories"
                value={editing.category ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, category: e.target.value })
                }
                placeholder="مثال: اجتماعات، أرقام، مهام"
              />
              <datalist id="note-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="اللون">
              <div className="flex gap-2 pt-1">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    aria-label={`لون ${c.label}`}
                    onClick={() => setEditing({ ...editing, color: c.value })}
                    className={clsx(
                      "h-9 w-9 rounded-full border-2",
                      c.cls,
                      (editing.color ?? "white") === c.value
                        ? "border-navy"
                        : "border-transparent",
                    )}
                  />
                ))}
              </div>
            </Field>
            {!editing.id && (
              <label className="flex items-center gap-3 self-end rounded-xl border border-silver-200 px-3.5 min-h-11 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!editing.pinned}
                  onChange={(e) =>
                    setEditing({ ...editing, pinned: e.target.checked })
                  }
                  className="h-4 w-4 accent-[#1C2D5A]"
                />
                <span className="text-sm font-bold text-navy flex items-center gap-1.5">
                  <Pin size={15} className="text-gold" /> تثبيت في الأعلى
                </span>
              </label>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}

function NoteBody({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div className="text-navy/85 text-sm leading-relaxed">
      {lines.map((l, i) => {
        const m = /^\s*[-•*]\s+(.*)$/.exec(l);
        if (m)
          return (
            <div key={i} className="flex gap-1.5">
              <span className="text-ice-600 shrink-0">•</span>
              <span>{m[1]}</span>
            </div>
          );
        return (
          <div key={i} className={l.trim() === "" ? "h-2" : undefined}>
            {l}
          </div>
        );
      })}
    </div>
  );
}

function NoteCard({
  note,
  onEdit,
  onPin,
  onDone,
  onArchive,
  onDelete,
}: {
  note: Note;
  onEdit: () => void;
  onPin: () => void;
  onDone: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = note.body.length > 260 || note.body.split("\n").length > 6;
  return (
    <div
      className={clsx(
        "group rounded-[14px] border p-4 pb-3 flex flex-col gap-2",
        noteColorClass(note.color),
        note.done && "opacity-90",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={onDone}
          className={clsx(
            "h-6 w-6 mt-0.5 shrink-0 rounded-md border-2 grid place-items-center transition",
            note.done
              ? "bg-ice border-ice text-navy-900"
              : "border-navy/30 hover:border-navy bg-white/60",
          )}
          title={note.done ? "إرجاع للنشطة" : "تم"}
          aria-label={note.done ? "إرجاع للنشطة" : "تعليم كمنتهية"}
        >
          {note.done && <Check size={14} />}
        </button>
        <button
          onClick={onEdit}
          className={clsx(
            "font-extrabold text-navy text-[16px] leading-snug flex-1 text-start",
            note.done && "line-through decoration-navy/40",
          )}
        >
          {note.title}
        </button>
        {note.pinned && <Pin size={15} className="text-gold shrink-0 mt-1" />}
      </div>

      {note.body && (
        <div
          className={clsx(
            !expanded && long && "max-h-40 overflow-hidden relative",
          )}
        >
          <NoteBody body={note.body} />
          {!expanded && long && (
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/90 to-transparent pointer-events-none" />
          )}
        </div>
      )}
      {long && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-ice-600 text-xs font-bold self-start"
        >
          {expanded ? "أقل" : "عرض الكل"}
        </button>
      )}

      <div className="mt-auto pt-2 flex items-center gap-1.5 flex-wrap">
        <span className="chip bg-white/70 text-navy">{note.category}</span>
        <span className="text-ink-2 text-[11px] ms-auto flex items-center gap-1">
          {note.updated_by_name && (
            <Avatar name={note.updated_by_name} size={18} tone="white" />
          )}
          {ago(note.updated_at)}
        </span>
      </div>

      <div className="reveal flex items-center gap-0.5 -mb-1.5 -mx-1.5 pt-1 border-t border-navy/10">
        <button
          onClick={onPin}
          className="h-9 w-9 rounded-md text-navy hover:bg-white/80 grid place-items-center"
          title={note.pinned ? "إلغاء التثبيت" : "تثبيت"}
          aria-label={note.pinned ? "إلغاء التثبيت" : "تثبيت"}
        >
          {note.pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
        <button
          onClick={onEdit}
          className="h-9 w-9 rounded-md text-navy hover:bg-white/80 grid place-items-center"
          title="تعديل"
          aria-label="تعديل"
        >
          <Pencil size={15} />
        </button>
        <button
          onClick={onArchive}
          className="h-9 w-9 rounded-md text-navy hover:bg-white/80 grid place-items-center"
          title="أرشفة"
          aria-label="أرشفة"
        >
          <Archive size={15} />
        </button>
        <button
          onClick={onDelete}
          className="h-9 w-9 rounded-md text-navy hover:bg-error-100 hover:text-error grid place-items-center ms-auto"
          title="حذف"
          aria-label="حذف"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
