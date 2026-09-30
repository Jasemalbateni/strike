"use client";

import clsx from "clsx";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpToLine,
  Copy,
  Lock,
  LockOpen,
  Minus,
  RotateCcw,
  RotateCw,
  Trash2,
  Square,
  Circle,
  Triangle,
  Undo2,
  Hash,
} from "lucide-react";
import { ASSETS, equipment, hasSecondary, mainColor, TEAMS, withMainColor } from "@/lib/drills/board";
import type { ArtEl, Dash, El, Heads, LineEl, Pattern, PenEl, ShapeEl, ShapeKind, TextEl, TokenEl } from "@/lib/drills/types";
import { ActionButton, Section, Seg, Slider, Swatches } from "./controls";
import { DashIcon, ShapeStyleFields } from "./palette";

export type PanelApi = {
  patch: (fn: (el: El) => El) => void;
  begin: () => void;
  live: (fn: (el: El) => El) => void;
  end: () => void;
  duplicate: () => void;
  remove: () => void;
  front: () => void;
  back: () => void;
  toggleLock: () => void;
  align: (how: "h" | "v") => void;
  distribute: (axis: "x" | "y") => void;
  renumber: () => void;
  editText: (id: string) => void;
};

const TYPE_LABEL: Record<El["t"], string> = { token: "لاعب", art: "أداة", line: "خط", pen: "رسم حر", shape: "شكل", text: "نص" };

export function selectionTitle(sel: El[]) {
  if (sel.length !== 1) return `${sel.length} عناصر`;
  const el = sel[0];
  if (el.t === "art") return equipment(el.art)?.label ?? "أداة";
  if (el.t === "token") return `${TEAMS.find((t) => t.v === el.team)?.label ?? "لاعب"}${el.text ? ` · ${el.text}` : ""}`;
  return TYPE_LABEL[el.t];
}

export default function PropsPanel({ sel, api }: { sel: El[]; api: PanelApi }) {
  const one = sel.length === 1 ? sel[0] : null;
  const all = <T extends El["t"]>(t: T) => sel.every((e) => e.t === t);
  const strokes = sel.every((e) => e.t === "line" || e.t === "pen");
  const locked = sel.every((e) => e.lock);
  const main = mainColor(sel[0]);
  const sameMain = sel.every((e) => mainColor(e).toLowerCase() === main.toLowerCase());

  return (
    <div>
      {/* colours */}
      {all("token") ? (
        <TokenFields sel={sel as TokenEl[]} api={api} />
      ) : all("art") ? (
        <ArtFields sel={sel as ArtEl[]} api={api} />
      ) : all("shape") ? (
        <ShapeFields sel={sel as ShapeEl[]} api={api} />
      ) : all("text") ? (
        <TextFields sel={sel as TextEl[]} api={api} />
      ) : strokes ? (
        <StrokeFields sel={sel as (LineEl | PenEl)[]} api={api} />
      ) : (
        <Section title="اللون">
          <Swatches value={sameMain ? main : null} onChange={(c) => c && api.patch((e) => withMainColor(e, c))} />
        </Section>
      )}

      {/* multi-selection layout */}
      {sel.length > 1 && (
        <Section title="ترتيب">
          <div className="grid grid-cols-4 gap-1.5">
            <ActionButton onClick={() => api.align("h")} title="محاذاة على خط أفقي">
              <AlignCenterHorizontal size={16} />
            </ActionButton>
            <ActionButton onClick={() => api.align("v")} title="محاذاة على خط عمودي">
              <AlignCenterVertical size={16} />
            </ActionButton>
            <ActionButton onClick={() => api.distribute("x")} title="توزيع أفقي متساوٍ" disabled={sel.length < 3}>
              <AlignHorizontalDistributeCenter size={16} />
            </ActionButton>
            <ActionButton onClick={() => api.distribute("y")} title="توزيع عمودي متساوٍ" disabled={sel.length < 3}>
              <AlignVerticalDistributeCenter size={16} />
            </ActionButton>
          </div>
          {sel.some((e) => e.t === "token") && (
            <ActionButton onClick={api.renumber} className="w-full mt-2">
              <Hash size={15} /> ترقيم اللاعبين تلقائياً
            </ActionButton>
          )}
        </Section>
      )}

      {/* actions */}
      <Section title="إجراءات">
        <div className="grid grid-cols-3 gap-1.5">
          <ActionButton onClick={api.duplicate} title="تكرار (Ctrl+D)">
            <Copy size={15} /> تكرار
          </ActionButton>
          <ActionButton onClick={api.front} title="إلى الأمام">
            <ArrowUpToLine size={15} /> أمام
          </ActionButton>
          <ActionButton onClick={api.back} title="إلى الخلف">
            <ArrowDownToLine size={15} /> خلف
          </ActionButton>
          <ActionButton onClick={api.toggleLock} title={locked ? "فك القفل" : "قفل (ما يتحرك)"}>
            {locked ? <LockOpen size={15} /> : <Lock size={15} />} {locked ? "فك" : "قفل"}
          </ActionButton>
          <ActionButton onClick={api.remove} danger className="col-span-2" title="حذف (Delete)">
            <Trash2 size={15} /> حذف
          </ActionButton>
        </div>
        {one && (one.t === "text" || one.t === "token") && (
          <p className="text-[11px] text-silver/70 mt-2">اضغط مرتين على {one.t === "text" ? "النص" : "اللاعب"} لتعديل الكتابة.</p>
        )}
      </Section>
    </div>
  );
}

/* ---------- per type ---------- */

function TokenFields({ sel, api }: { sel: TokenEl[]; api: PanelApi }) {
  const one = sel.length === 1 ? sel[0] : null;
  const fill = sel.every((e) => e.fill === sel[0].fill) ? sel[0].fill : null;
  const s = sel[0].s;
  return (
    <>
      {one && (
        <Section title="الرقم / الاسم">
          <input
            className="studio-field"
            value={one.text}
            maxLength={12}
            onFocus={api.begin}
            onBlur={api.end}
            onChange={(e) => {
              const v = e.target.value;
              api.live((el) => (el.t === "token" ? { ...el, text: v } : el));
            }}
            placeholder="مثال: 7 أو م"
          />
        </Section>
      )}
      <Section title="لون القميص">
        <Swatches value={fill} onChange={(c) => c && api.patch((el) => (el.t === "token" ? { ...el, fill: c, tc: undefined } : el))} />
      </Section>
      <Section title="لون الإطار">
        <Swatches value={sel[0].stroke} onChange={(c) => c && api.patch((el) => (el.t === "token" ? { ...el, stroke: c } : el))} />
      </Section>
      <Section title="الحجم">
        <Slider value={Math.round(s * 100)} min={40} max={300} step={5} onStart={api.begin} onEnd={api.end} onChange={(v) => api.live((el) => (el.t === "token" ? { ...el, s: v / 100 } : el))} format={(v) => `${v}%`} />
      </Section>
    </>
  );
}

function ArtFields({ sel, api }: { sel: ArtEl[]; api: PanelApi }) {
  const key = sel.every((e) => e.art === sel[0].art) ? sel[0].art : null;
  const a = key ? ASSETS[key] : null;
  const c1 = sel.every((e) => (e.c1 ?? "") === (sel[0].c1 ?? "")) ? sel[0].c1 ?? a?.defaults.c1 ?? null : null;
  const second = key ? hasSecondary(key) : false;
  const c2 = second ? sel[0].c2 ?? a?.defaults.c2 ?? null : null;
  const recoloured = sel.some((e) => e.c1 || e.c2);
  return (
    <>
      <Section title={second ? "اللون الأساسي" : "اللون"} action={recoloured ? <ResetColors onClick={() => api.patch((el) => (el.t === "art" ? { ...el, c1: undefined, c2: undefined } : el))} /> : null}>
        <Swatches value={c1} onChange={(c) => c && api.patch((el) => (el.t === "art" ? { ...el, c1: c } : el))} />
      </Section>
      {second && (
        <Section title="اللون الثاني">
          <Swatches value={c2} onChange={(c) => c && api.patch((el) => (el.t === "art" ? { ...el, c2: c } : el))} />
        </Section>
      )}
      <SizeRotate sel={sel} api={api} />
    </>
  );
}

function ResetColors({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[11px] font-bold text-ice hover:text-white inline-flex items-center gap-1">
      <Undo2 size={12} /> الألوان الأصلية
    </button>
  );
}

function SizeRotate({ sel, api }: { sel: (ArtEl | ShapeEl | TextEl)[]; api: PanelApi }) {
  const first = sel[0];
  const r = first.r;
  return (
    <Section title={first.t === "shape" ? "التدوير" : "الحجم والتدوير"}>
      <div className="grid grid-cols-1 gap-2.5">
        {first.t === "art" && (
          <Slider value={Math.round(first.s * 100)} min={30} max={400} step={5} onStart={api.begin} onEnd={api.end} onChange={(v) => api.live((el) => (el.t === "art" ? { ...el, s: v / 100 } : el))} format={(v) => `${v}%`} label="الحجم" />
        )}
        {first.t === "text" && (
          <Slider value={first.size} min={8} max={120} step={1} onStart={api.begin} onEnd={api.end} onChange={(v) => api.live((el) => (el.t === "text" ? { ...el, size: v } : el))} label="الحجم" />
        )}
        <Slider value={Math.round(r)} min={-180} max={180} step={1} onStart={api.begin} onEnd={api.end} onChange={(v) => api.live((el) => ("r" in el ? ({ ...el, r: v } as El) : el))} format={(v) => `${v}°`} label="الزاوية" />
        <div className="grid grid-cols-3 gap-1.5">
          <ActionButton onClick={() => api.patch((el) => ("r" in el ? ({ ...el, r: norm(el.r - 90) } as El) : el))} title="تدوير 90° عكس عقارب الساعة">
            <RotateCcw size={15} /> 90°
          </ActionButton>
          <ActionButton onClick={() => api.patch((el) => ("r" in el ? ({ ...el, r: norm(el.r + 180) } as El) : el))} title="قلب 180°">
            <ArrowLeftRight size={15} /> قلب
          </ActionButton>
          <ActionButton onClick={() => api.patch((el) => ("r" in el ? ({ ...el, r: norm(el.r + 90) } as El) : el))} title="تدوير 90° مع عقارب الساعة">
            <RotateCw size={15} /> 90°
          </ActionButton>
        </div>
      </div>
    </Section>
  );
}

const norm = (a: number) => {
  let r = a % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return r;
};

function ShapeFields({ sel, api }: { sel: ShapeEl[]; api: PanelApi }) {
  const s = sel[0];
  const kind = sel.every((e) => e.shape === s.shape) ? s.shape : null;
  return (
    <>
      <Section title="الشكل">
        <Seg<ShapeKind>
          value={kind}
          onChange={(v) => api.patch((el) => (el.t === "shape" ? { ...el, shape: v } : el))}
          options={[
            { v: "rect", icon: <Square size={16} />, label: "مربع" },
            { v: "ellipse", icon: <Circle size={16} />, label: "دائرة" },
            { v: "tri", icon: <Triangle size={16} />, label: "مثلث" },
          ]}
          size="sm"
        />
      </Section>
      <ShapeStyleFields
        style={s}
        onStart={api.begin}
        onEnd={api.end}
        onChange={(patch) => {
          const live = "fo" in patch || ("sw" in patch && Object.keys(patch).length === 1);
          (live ? api.live : api.patch)((el) => (el.t === "shape" ? { ...el, ...patch } : el));
        }}
      />
      <SizeRotate sel={sel} api={api} />
    </>
  );
}

function TextFields({ sel, api }: { sel: TextEl[]; api: PanelApi }) {
  const one = sel.length === 1 ? sel[0] : null;
  return (
    <>
      {one && (
        <Section title="النص">
          <textarea
            className="studio-field min-h-[64px] resize-none"
            value={one.text}
            onFocus={api.begin}
            onBlur={api.end}
            onChange={(e) => {
              const v = e.target.value;
              api.live((el) => (el.t === "text" ? { ...el, text: v } : el));
            }}
          />
        </Section>
      )}
      <Section title="لون النص">
        <Swatches value={sel[0].color} onChange={(c) => c && api.patch((el) => (el.t === "text" ? { ...el, color: c } : el))} />
      </Section>
      <Section title="الخلفية">
        <Swatches value={sel[0].bg} allowNone noneLabel="بدون خلفية" onChange={(c) => api.patch((el) => (el.t === "text" ? { ...el, bg: c } : el))} />
      </Section>
      <SizeRotate sel={sel} api={api} />
    </>
  );
}

function StrokeFields({ sel, api }: { sel: (LineEl | PenEl)[]; api: PanelApi }) {
  const f = sel[0];
  const lines = sel.filter((e): e is LineEl => e.t === "line");
  const curved = lines.some((l) => l.c);
  const pattern = lines.length === sel.length && lines.every((l) => l.pattern === lines[0].pattern) ? lines[0].pattern : null;
  return (
    <>
      <Section title="اللون">
        <Swatches value={sel.every((e) => e.color === f.color) ? f.color : null} onChange={(c) => c && api.patch((el) => (el.t === "line" || el.t === "pen" ? { ...el, color: c } : el))} />
      </Section>
      <Section title="شكل الخط">
        <div className="grid grid-cols-1 gap-2">
          {lines.length === sel.length && (
            <Seg<Pattern>
              value={pattern}
              onChange={(v) => api.patch((el) => (el.t === "line" ? { ...el, pattern: v } : el))}
              options={[
                { v: "plain", label: "مستقيم" },
                { v: "zigzag", label: "زقزاق" },
                { v: "wave", label: "موجة" },
              ]}
              size="sm"
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Seg<Dash>
              value={sel.every((e) => e.dash === f.dash) ? f.dash : null}
              onChange={(v) => api.patch((el) => (el.t === "line" || el.t === "pen" ? { ...el, dash: v } : el))}
              options={[
                { v: "solid", icon: <DashIcon dash="solid" />, title: "متصل" },
                { v: "dashed", icon: <DashIcon dash="dashed" />, title: "متقطع" },
                { v: "dotted", icon: <DashIcon dash="dotted" />, title: "منقط" },
              ]}
              size="sm"
            />
            <Seg<Heads>
              value={sel.every((e) => e.heads === f.heads) ? f.heads : null}
              onChange={(v) => api.patch((el) => (el.t === "line" || el.t === "pen" ? { ...el, heads: v } : el))}
              options={[
                { v: "none", icon: <Minus size={16} />, title: "بدون سهم" },
                { v: "end", icon: <ArrowRight size={16} className="rotate-180" />, title: "سهم" },
                { v: "both", icon: <ArrowLeftRight size={16} />, title: "سهمين" },
              ]}
              size="sm"
            />
          </div>
          <Slider label="السماكة" value={f.w} min={1.5} max={9} step={0.5} onStart={api.begin} onEnd={api.end} onChange={(v) => api.live((el) => (el.t === "line" || el.t === "pen" ? { ...el, w: v } : el))} />
          {lines.length > 0 && (
            <div className="grid grid-cols-1 gap-1.5">
              <ActionButton onClick={() => api.patch((el) => (el.t === "line" ? { ...el, a: el.b, b: el.a } : el))} title="عكس اتجاه السهم">
                <ArrowLeftRight size={15} /> عكس اتجاه السهم
              </ActionButton>
              {curved && (
                <ActionButton onClick={() => api.patch((el) => (el.t === "line" ? { ...el, c: undefined } : el))} title="إرجاع الخط مستقيماً">
                  <Minus size={15} /> إلغاء الانحناء
                </ActionButton>
              )}
            </div>
          )}
        </div>
        {lines.length > 0 && <p className="text-[11px] text-silver/70 mt-2">اسحب النقطة الوسطى للخط لتقويسه.</p>}
      </Section>
    </>
  );
}

export function EmptyHint({ className }: { className?: string }) {
  return <div className={clsx("text-[12px] text-silver/70", className)}>اختر عنصراً لتعديله.</div>;
}
