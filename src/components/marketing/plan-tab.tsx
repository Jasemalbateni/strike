"use client";

import { useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, GripVertical, Coins, CalendarRange } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { useDndSensors } from "./dnd";
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useHub } from "./store";
import { Field, Modal, PlatformChip, PlatformSelect, fmtNum } from "@/components/ui";
import { PLAN_KINDS, type PlanItem, type PlanKind, type Platform } from "@/lib/types";

export default function PlanTab() {
  const { data, insert, update, remove } = useHub();
  const [editing, setEditing] = useState<Partial<PlanItem> | null>(null);
  const totalBudget = data.plan.filter((p) => p.kind === "budget").reduce((s, p) => s + (Number(p.budget_amount) || 0), 0);
  const campaignBudget = data.plan.filter((p) => p.kind === "campaign").reduce((s, p) => s + (Number(p.budget_amount) || 0), 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const values = {
      kind: editing.kind ?? "other",
      title: editing.title?.trim() || "بدون عنوان",
      body: editing.body ?? "",
      platform: editing.platform ?? "general",
      budget_amount: editing.budget_amount === undefined || editing.budget_amount === null || editing.budget_amount === ("" as unknown) ? null : Number(editing.budget_amount),
      start_date: editing.start_date || null,
      end_date: editing.end_date || null,
    };
    if (editing.id) await update("plan", editing.id, values);
    else await insert("plan", { ...values, position: data.plan.filter((p) => p.kind === values.kind).length });
    setEditing(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="card px-4 py-2.5 flex items-baseline gap-2">
            <span className="num text-navy text-[22px] font-bold leading-none">{fmtNum(totalBudget)}</span>
            <span className="text-ink-2 text-xs font-bold">د.ك الميزانية الكلية</span>
          </div>
          <div className="card px-4 py-2.5 flex items-baseline gap-2">
            <span className={clsx("num text-[22px] font-bold leading-none", campaignBudget > totalBudget && totalBudget > 0 ? "text-error" : "text-navy")}>{fmtNum(campaignBudget)}</span>
            <span className="text-ink-2 text-xs font-bold">د.ك موزّعة على الحملات</span>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ kind: "campaign", platform: "general", title: "", body: "" })}>
          <Plus size={18} /> عنصر جديد
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {PLAN_KINDS.map((k) => (
          <Section
            key={k.value}
            kind={k.value}
            label={k.label}
            hint={k.hint}
            items={data.plan.filter((p) => p.kind === k.value)}
            onAdd={() => setEditing({ kind: k.value, platform: "general", title: "", body: "" })}
            onEdit={(it) => setEditing(it)}
            onDelete={(id) => remove("plan", id)}
            onReorder={async (next) => {
              await Promise.all(next.map((p, i) => (p.position !== i ? update("plan", p.id, { position: i }) : null)));
            }}
          />
        ))}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "تعديل" : "عنصر جديد في الخطة"}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
              إلغاء
            </button>
            <button form="plan-form" className="btn-primary">
              حفظ
            </button>
          </>
        }
      >
        {editing && (
          <form id="plan-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="النوع">
              <select className="field" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as PlanKind })}>
                {PLAN_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="المنصة">
              <PlatformSelect value={(editing.platform ?? "general") as Platform} onChange={(platform) => setEditing({ ...editing, platform })} />
            </Field>
            <Field label="العنوان" className="sm:col-span-2">
              <input className="field" autoFocus value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required />
            </Field>
            <Field label="التفاصيل" className="sm:col-span-2">
              <textarea className="field min-h-28" value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder="اكتب بحرية: مين الجمهور، وش الرسالة، كيف نقيس النجاح…" />
            </Field>
            <Field label="الميزانية (د.ك)">
              <input className="field num" dir="ltr" type="number" step="any" min={0} value={editing.budget_amount ?? ""} onChange={(e) => setEditing({ ...editing, budget_amount: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="من">
                <input className="field num" dir="ltr" type="date" value={editing.start_date ?? ""} onChange={(e) => setEditing({ ...editing, start_date: e.target.value || null })} />
              </Field>
              <Field label="إلى">
                <input className="field num" dir="ltr" type="date" value={editing.end_date ?? ""} onChange={(e) => setEditing({ ...editing, end_date: e.target.value || null })} />
              </Field>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function Section({
  kind,
  label,
  hint,
  items,
  onAdd,
  onEdit,
  onDelete,
  onReorder,
}: {
  kind: PlanKind;
  label: string;
  hint: string;
  items: PlanItem[];
  onAdd: () => void;
  onEdit: (it: PlanItem) => void;
  onDelete: (id: string) => void;
  onReorder: (next: PlanItem[]) => void;
}) {
  const sensors = useDndSensors();
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(items, items.findIndex((i) => i.id === active.id), items.findIndex((i) => i.id === over.id)));
  }
  const sum = items.reduce((s, p) => s + (Number(p.budget_amount) || 0), 0);
  return (
    <section className="card p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-navy font-extrabold text-[17px]">{label}</h3>
          {hint && <p className="text-ink-2 text-xs mt-0.5">{hint}</p>}
        </div>
        <button onClick={onAdd} className="btn-outline h-8 px-2.5 text-sm shrink-0">
          <Plus size={15} /> إضافة
        </button>
      </div>
      {(kind === "budget" || kind === "campaign") && sum > 0 && (
        <div className="flex items-center gap-1.5 text-xs font-bold text-navy">
          <Coins size={14} className="text-gold" /> <span className="num">{fmtNum(sum)}</span> د.ك
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-ink-2 text-sm rounded-xl border border-dashed border-silver p-4 text-center">لا شي هنا بعد</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {items.map((it) => (
                <PlanCard key={it.id} item={it} onEdit={() => onEdit(it)} onDelete={() => confirm("حذف العنصر؟") && onDelete(it.id)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

function PlanCard({ item, onEdit, onDelete }: { item: PlanItem; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={clsx("group rounded-xl border border-silver-200 bg-white p-3 flex gap-2", isDragging && "dragging z-10")}>
      <button {...attributes} {...listeners} className="text-silver hover:text-navy cursor-grab active:cursor-grabbing p-0.5 self-start touch-none" aria-label="اسحب">
        <GripVertical size={16} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-navy">{item.title}</span>
          {item.platform !== "general" && <PlatformChip platform={item.platform} />}
          {item.budget_amount !== null && (
            <span className="chip bg-gold-100 text-navy-900 num">{fmtNum(Number(item.budget_amount))} د.ك</span>
          )}
        </div>
        {item.body && <p className="text-ink-2 text-sm mt-1 leading-relaxed whitespace-pre-wrap">{item.body}</p>}
        {(item.start_date || item.end_date) && (
          <div className="flex items-center gap-1.5 text-ink-2 text-xs mt-1.5">
            <CalendarRange size={13} />
            <span className="num" dir="ltr">
              {item.start_date ?? "…"} → {item.end_date ?? "…"}
            </span>
          </div>
        )}
      </div>
      <div className="reveal flex flex-col gap-0.5">
        <button onClick={onEdit} className="p-1.5 rounded-lg text-ink-2 hover:bg-navy-50 hover:text-navy" aria-label="تعديل">
          <Pencil size={14} />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg text-ink-2 hover:bg-error-100 hover:text-error" aria-label="حذف">
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
