"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, GripVertical, CalendarRange } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { useDndSensors } from "./dnd";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useHub } from "./store";
import { useConfirm } from "@/components/confirm";

import { EmptyState, Field, Modal, PlatformChip, PlatformSelect, fmtNum } from "@/components/ui";
import { METRICS, metricLabel, type Goal, type Metric, type Platform } from "@/lib/types";

const blank = (): Partial<Goal> => ({
  title: "",
  platform: "instagram",
  metric: "followers",
  target_value: 1000,
  current_value: 0,
  unit: "متابع",
  period_start: null,
  period_end: null,
  notes: "",
});

export default function GoalsTab() {
  const { data, insert, update, remove } = useHub();
  const confirm = useConfirm();
  const goals = data.goals;
  const [editing, setEditing] = useState<Partial<Goal> | null>(null);

  const sensors = useDndSensors();

  const summary = useMemo(() => {
    if (!goals.length) return null;
    const pct = goals.map((g) => (g.target_value > 0 ? Math.min(g.current_value / g.target_value, 1) : 0));
    const avg = Math.round((pct.reduce((a, b) => a + b, 0) / goals.length) * 100);
    const done = pct.filter((p) => p >= 1).length;
    const next = goals.filter((g) => g.period_end).map((g) => g.period_end!).sort()[0];
    return { avg, done, next };
  }, [goals]);

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = goals.findIndex((g) => g.id === active.id);
    const to = goals.findIndex((g) => g.id === over.id);
    const next = arrayMove(goals, from, to);
    await Promise.all(next.map((g, i) => (g.position !== i ? update("goals", g.id, { position: i }) : null)));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const values = {
      title: editing.title?.trim() || "هدف",
      platform: editing.platform,
      metric: editing.metric,
      target_value: Number(editing.target_value) || 0,
      current_value: Number(editing.current_value) || 0,
      unit: editing.unit ?? "",
      period_start: editing.period_start || null,
      period_end: editing.period_end || null,
      notes: editing.notes ?? "",
    };
    if (editing.id) await update("goals", editing.id, values);
    else await insert("goals", { ...values, position: goals.length });
    setEditing(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {summary ? (
          <div className="flex flex-wrap gap-3">
            <Stat label="متوسط الإنجاز" value={`${summary.avg}%`} accent />
            <Stat label="أهداف مكتملة" value={`${summary.done}/${goals.length}`} />
            {summary.next && <Stat label="أقرب موعد" value={summary.next} />}
          </div>
        ) : (
          <div />
        )}
        <button className="btn-primary" onClick={() => setEditing(blank())}>
          <Plus size={18} /> هدف جديد
        </button>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          title="ما فيه أهداف بعد"
          hint="ابدأ بهدف واضح: مثلاً 5,000 متابع على انستغرام قبل نهاية الموسم."
          action={
            <button className="btn-accent" onClick={() => setEditing(blank())}>
              <Plus size={18} /> أضف أول هدف
            </button>
          }
        />
      ) : (
        <DndContext id="goals-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={goals.map((g) => g.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {goals.map((g) => (
                <GoalCard key={g.id} goal={g} onEdit={() => setEditing(g)} onDelete={async () => (await confirm({ title: "حذف الهدف؟", message: `«${g.title}» بينحذف نهائياً.` })) && remove("goals", g.id)} onQuick={(v) => update("goals", g.id, { current_value: v })} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "تعديل الهدف" : "هدف جديد"}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
              إلغاء
            </button>
            <button form="goal-form" className="btn-primary">
              حفظ
            </button>
          </>
        }
      >
        {editing && (
          <form id="goal-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="الهدف" className="sm:col-span-2">
              <input className="field" autoFocus value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="مثال: الوصول إلى 5,000 متابع" required />
            </Field>
            <Field label="المنصة">
              <PlatformSelect value={editing.platform as Platform} onChange={(platform) => setEditing({ ...editing, platform })} />
            </Field>
            <Field label="المقياس">
              <select
                className="field"
                value={editing.metric}
                onChange={(e) => {
                  const metric = e.target.value as Metric;
                  setEditing({ ...editing, metric, unit: METRICS.find((m) => m.value === metric)?.unit ?? "" });
                }}
              >
                {METRICS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="المستهدف">
              <input className="field num" dir="ltr" type="number" step="any" min={0} value={editing.target_value ?? 0} onChange={(e) => setEditing({ ...editing, target_value: Number(e.target.value) })} />
            </Field>
            <Field label="الحالي">
              <input className="field num" dir="ltr" type="number" step="any" min={0} value={editing.current_value ?? 0} onChange={(e) => setEditing({ ...editing, current_value: Number(e.target.value) })} />
            </Field>
            <Field label="الوحدة">
              <input className="field" value={editing.unit ?? ""} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="من">
                <input className="field num" dir="ltr" type="date" value={editing.period_start ?? ""} onChange={(e) => setEditing({ ...editing, period_start: e.target.value || null })} />
              </Field>
              <Field label="إلى">
                <input className="field num" dir="ltr" type="date" value={editing.period_end ?? ""} onChange={(e) => setEditing({ ...editing, period_end: e.target.value || null })} />
              </Field>
            </div>
            <Field label="ملاحظات" className="sm:col-span-2">
              <textarea className="field min-h-20" value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card px-4 py-2.5 flex items-baseline gap-2">
      <span className={clsx("num text-[22px] font-bold leading-none", accent ? "text-ice-600" : "text-navy")}>{value}</span>
      <span className="text-ink-2 text-xs font-bold">{label}</span>
    </div>
  );
}

function GoalCard({ goal, onEdit, onDelete, onQuick }: { goal: Goal; onEdit: () => void; onDelete: () => void; onQuick: (v: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: goal.id });
  const pct = goal.target_value > 0 ? Math.round((goal.current_value / goal.target_value) * 100) : 0;
  const clamped = Math.min(pct, 100);
  const [quick, setQuick] = useState<string | null>(null);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx("card p-4 flex flex-col gap-3 group", isDragging && "dragging z-10")}
    >
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="text-silver hover:text-navy cursor-grab active:cursor-grabbing -ms-2.5 h-9 w-9 grid place-items-center rounded-md touch-none" aria-label="اسحب لإعادة الترتيب">
          <GripVertical size={16} />
        </button>
        <PlatformChip platform={goal.platform} full />
        <span className="text-ink-2 text-xs font-bold">{metricLabel(goal.metric)}</span>
        <div className="reveal ms-auto flex gap-0.5">
          <button onClick={onEdit} className="h-9 w-9 grid place-items-center rounded-lg text-ink-2 hover:bg-navy-50 hover:text-navy" aria-label="تعديل">
            <Pencil size={15} />
          </button>
          <button onClick={onDelete} className="h-9 w-9 grid place-items-center rounded-lg text-ink-2 hover:bg-error-100 hover:text-error" aria-label="حذف">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="font-extrabold text-navy text-[17px] leading-snug">{goal.title}</div>

      <div className="flex items-end gap-2">
        {quick === null ? (
          <button className="num text-navy text-[30px] font-bold leading-none hover:text-ice-600" onClick={() => setQuick(String(goal.current_value))} title="تحديث الرقم الحالي">
            {fmtNum(goal.current_value)}
          </button>
        ) : (
          <input
            autoFocus
            dir="ltr"
            type="number"
            step="any"
            className="field num w-32 py-1 text-[20px]"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onBlur={() => {
              const v = Number(quick) || 0;
              if (v !== goal.current_value) onQuick(v);
              setQuick(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setQuick(null);
            }}
          />
        )}
        <span className="num text-ink-2 text-[15px] pb-1">/ {fmtNum(goal.target_value)}</span>
        {goal.unit && <span className="text-ink-2 text-xs pb-1.5">{goal.unit}</span>}
        <span className={clsx("num ms-auto text-[15px] font-bold pb-1", pct >= 100 ? "text-gold" : "text-ice-600")}>{pct}%</span>
      </div>

      <div className="h-2 rounded-full bg-silver-100 overflow-hidden">
        <div className={clsx("h-full rounded-full transition-all duration-500", pct >= 100 ? "bg-gold" : "bg-ice")} style={{ width: `${clamped}%` }} />
      </div>

      {(goal.period_start || goal.period_end) && (
        <div className="flex items-center gap-1.5 text-ink-2 text-xs">
          <CalendarRange size={14} />
          <span className="num" dir="ltr">
            {goal.period_start ?? "…"} → {goal.period_end ?? "…"}
          </span>
        </div>
      )}
      {goal.notes && <p className="text-ink-2 text-sm leading-relaxed whitespace-pre-wrap">{goal.notes}</p>}
    </div>
  );
}
