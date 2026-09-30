"use client";

import clsx from "clsx";
import { RectangleHorizontal, RectangleVertical, RotateCcw } from "lucide-react";
import { defaultUnit, PITCH_KINDS, PITCH_STYLES } from "@/lib/drills/pitch";
import type { Board, Pitch, PitchKind, PitchStyle } from "@/lib/drills/types";
import { BoardStatic } from "./render";
import { Section, Seg, Slider, Swatches } from "./controls";

export default function PitchPanel({
  pitch,
  u,
  snap,
  onPitch,
  onUnit,
  onUnitStart,
  onUnitEnd,
  onSnap,
}: {
  pitch: Pitch;
  u: number;
  snap: boolean;
  onPitch: (p: Partial<Pitch>) => void;
  onUnit: (u: number) => void;
  onUnitStart: () => void;
  onUnitEnd: () => void;
  onSnap: (v: boolean) => void;
}) {
  return (
    <div>
      <Section title="الملعب">
        <div className="grid grid-cols-3 gap-1.5">
          {PITCH_KINDS.map((k) => (
            <PitchThumb key={k.v} kind={k.v} label={k.label} active={pitch.kind === k.v} style={pitch.style} onClick={() => onPitch({ kind: k.v })} />
          ))}
        </div>
      </Section>
      <Section title="الاتجاه">
        <Seg<"h" | "v">
          value={pitch.vertical ? "v" : "h"}
          onChange={(v) => onPitch({ vertical: v === "v" })}
          options={[
            { v: "h", icon: <RectangleHorizontal size={16} />, label: "أفقي" },
            { v: "v", icon: <RectangleVertical size={16} />, label: "عمودي" },
          ]}
          size="sm"
        />
      </Section>
      <Section title="لون الأرضية">
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {PITCH_STYLES.map((s) => (
            <button
              key={s.v}
              type="button"
              onClick={() => onPitch({ style: s.v as PitchStyle, bg: undefined, line: undefined })}
              className={clsx("rounded-xl border p-1 text-[11px] font-bold text-center", pitch.style === s.v ? "border-ice bg-ice/15 text-white" : "border-white/[0.07] bg-white/[0.04] text-silver")}
            >
              <span className="block h-7 rounded-lg mb-1 border border-white/10" style={{ background: `repeating-linear-gradient(90deg, ${s.bg} 0 10px, ${s.stripe} 10px 20px)`, boxShadow: `inset 0 0 0 2px ${s.line}55` }} />
              {s.label}
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-3 text-[12.5px] text-silver font-bold mb-3 cursor-pointer select-none">
          خطوط العشب
          <Toggle on={pitch.stripes} onChange={(v) => onPitch({ stripes: v })} />
        </label>
        <div className="text-[11.5px] font-bold text-silver/80 mb-2">لون مخصص للأرضية</div>
        <Swatches value={pitch.style === "custom" ? pitch.bg ?? null : null} onChange={(c) => c && onPitch({ style: "custom", bg: c })} />
        <div className="text-[11.5px] font-bold text-silver/80 mt-3 mb-2">لون خطوط الملعب</div>
        <Swatches value={pitch.line ?? null} onChange={(c) => c && onPitch({ line: c })} />
      </Section>
      <Section
        title="حجم اللاعبين والأدوات"
        action={
          u !== defaultUnit(pitch.kind) ? (
            <button type="button" onClick={() => onUnit(defaultUnit(pitch.kind))} className="text-[11px] font-bold text-ice inline-flex items-center gap-1">
              <RotateCcw size={12} /> افتراضي
            </button>
          ) : null
        }
      >
        <Slider value={u} min={16} max={56} step={1} onStart={onUnitStart} onEnd={onUnitEnd} onChange={onUnit} format={(v) => `${Math.round((v / defaultUnit(pitch.kind)) * 100)}%`} />
      </Section>
      <Section>
        <label className="flex items-center justify-between gap-3 text-[12.5px] text-silver font-bold cursor-pointer select-none">
          <span>
            محاذاة ذكية
            <span className="block text-[11px] font-medium text-silver/60 mt-0.5">تلتصق العناصر بخط واحد وأنت تسحبها</span>
          </span>
          <Toggle on={snap} onChange={onSnap} />
        </label>
      </Section>
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={clsx("relative h-6 w-11 rounded-full transition-colors shrink-0", on ? "bg-ice" : "bg-white/15")}>
      <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-0.5" : "left-[22px]")} />
    </button>
  );
}

function PitchThumb({ kind, label, active, style, onClick }: { kind: PitchKind; label: string; active: boolean; style: PitchStyle; onClick: () => void }) {
  const b: Board = { v: 1, pitch: { kind, vertical: false, style: style === "custom" ? "grass" : style, stripes: true }, u: 30, frames: [{ id: "thumb", els: [] }] };
  return (
    <button type="button" onClick={onClick} className={clsx("rounded-xl border p-1 text-[11px] font-bold", active ? "border-ice bg-ice/15 text-white" : "border-white/[0.07] bg-white/[0.04] text-silver hover:text-white")}>
      <span className="block aspect-[4/3] rounded-lg overflow-hidden bg-black/20 mb-1 grid place-items-center">
        <BoardStatic board={b} className="w-full h-full" />
      </span>
      {label}
    </button>
  );
}
