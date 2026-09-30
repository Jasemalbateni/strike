"use client";

import clsx from "clsx";
import { Circle, Square, Triangle, Minus, Activity, Spline, ArrowRight, ArrowLeftRight } from "lucide-react";
import { EQUIPMENT, LINE_PRESETS, SHAPE_PRESETS, TEAMS } from "@/lib/drills/board";
import { dashArray, lineGeometry } from "@/lib/drills/geometry";
import type { Dash, Heads, LineStyle, Pattern, ShapeKind, ShapeStyle, Team } from "@/lib/drills/types";
import { ArtPreview, TokenPreview } from "./render";
import { Section, Seg, Slider, Swatches } from "./controls";

export type PaletteItem = { kind: "token"; team: Team } | { kind: "art"; key: string };

type ItemDown = (e: React.PointerEvent<HTMLButtonElement>, item: PaletteItem) => void;

function ItemButton({ label, onPointerDown, children, touchAction }: { label: string; onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void; children: React.ReactNode; touchAction: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={`إضافة ${label}`}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      className="group flex flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] active:bg-ice/20 border border-white/[0.06] py-2 px-1 select-none cursor-grab active:cursor-grabbing transition-colors"
      style={{ touchAction }}
    >
      <span className="h-9 grid place-items-center pointer-events-none">{children}</span>
      <span className="text-[11px] font-bold text-silver group-hover:text-white leading-tight text-center truncate max-w-full pointer-events-none">{label}</span>
    </button>
  );
}

export function PlayersGrid({ onItemDown, row }: { onItemDown: ItemDown; row?: boolean }) {
  const ta = row ? "pan-x" : "pan-y";
  return (
    <div className={clsx(row ? "flex gap-2 [&>*]:w-[72px] [&>*]:shrink-0" : "grid grid-cols-3 gap-1.5")}>
      {TEAMS.map((t) => (
        <ItemButton key={t.v} label={t.label} touchAction={ta} onPointerDown={(e) => onItemDown(e, { kind: "token", team: t.v })}>
          <TokenPreview fill={t.fill} stroke={t.stroke} text={t.v === "gk" ? "GK" : t.v === "n" ? "J" : t.v === "a" ? "7" : "10"} size={34} />
        </ItemButton>
      ))}
      <ItemButton label="مدرب" touchAction={ta} onPointerDown={(e) => onItemDown(e, { kind: "art", key: "coach" })}>
        <ArtPreview art="coach" size={34} />
      </ItemButton>
    </div>
  );
}

export function EquipmentGrid({ onItemDown, row }: { onItemDown: ItemDown; row?: boolean }) {
  const ta = row ? "pan-x" : "pan-y";
  return (
    <div className={clsx(row ? "flex gap-2 [&>*]:w-[72px] [&>*]:shrink-0" : "grid grid-cols-3 gap-1.5")}>
      {EQUIPMENT.filter((e) => e.key !== "coach").map((e) => (
        <ItemButton key={e.key} label={e.label} touchAction={ta} onPointerDown={(ev) => onItemDown(ev, { kind: "art", key: e.key })}>
          <ArtPreview art={e.key} size={e.key === "ladder" || e.key === "goal" ? 38 : 34} />
        </ItemButton>
      ))}
    </div>
  );
}

/* ---------- line tool options ---------- */

function LinePreview({ style, color }: { style: Omit<LineStyle, "color">; color: string }) {
  const g = lineGeometry({ a: { x: 6, y: 20 }, b: { x: 94, y: 20 }, w: style.w * 0.9, pattern: style.pattern, heads: style.heads });
  return (
    <svg viewBox="0 0 100 40" className="w-full h-7" aria-hidden>
      <path d={g.d} fill="none" stroke={color} strokeWidth={style.w * 0.9} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashArray(style.dash, style.w * 0.9)} />
      {g.heads.map((h, i) => (
        <path key={i} d={h} fill={color} stroke={color} strokeWidth={style.w * 0.3} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export function matchPreset(s: LineStyle) {
  return LINE_PRESETS.find((p) => p.style.dash === s.dash && p.style.pattern === s.pattern && p.style.heads === s.heads && Math.abs(p.style.w - s.w) < 0.01)?.id ?? null;
}

export function LineOptions({ style, onChange, compact }: { style: LineStyle; onChange: (patch: Partial<LineStyle>) => void; compact?: boolean }) {
  const active = matchPreset(style);
  return (
    <>
      <Section title={compact ? undefined : "نوع الخط"}>
        <div className={clsx(compact ? "flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" : "grid grid-cols-2 gap-1.5")}>
          {LINE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.style)}
              className={clsx(
                "rounded-xl px-2 pt-1 pb-1.5 border transition-colors text-center",
                compact && "w-[92px] shrink-0",
                active === p.id ? "bg-ice/15 border-ice text-white" : "bg-white/[0.04] border-white/[0.06] text-silver hover:bg-white/[0.08]",
              )}
            >
              <LinePreview style={p.style} color={active === p.id ? "#4DA8FF" : "#ffffff"} />
              <span className="block text-[11.5px] font-bold leading-none">{p.label}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title={compact ? undefined : "تخصيص"}>
        <div className="grid grid-cols-1 gap-2">
          <Seg<Pattern>
            value={style.pattern}
            onChange={(v) => onChange({ pattern: v })}
            options={[
              { v: "plain", label: "مستقيم" },
              { v: "zigzag", label: "زقزاق" },
              { v: "wave", label: "موجة" },
            ]}
            size="sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Seg<Dash>
              value={style.dash}
              onChange={(v) => onChange({ dash: v })}
              options={[
                { v: "solid", icon: <DashIcon dash="solid" />, title: "متصل" },
                { v: "dashed", icon: <DashIcon dash="dashed" />, title: "متقطع" },
                { v: "dotted", icon: <DashIcon dash="dotted" />, title: "منقط" },
              ]}
              size="sm"
            />
            <Seg<Heads>
              value={style.heads}
              onChange={(v) => onChange({ heads: v })}
              options={[
                { v: "none", icon: <Minus size={16} />, title: "بدون سهم" },
                { v: "end", icon: <ArrowRight size={16} className="rotate-180" />, title: "سهم" },
                { v: "both", icon: <ArrowLeftRight size={16} />, title: "سهمين" },
              ]}
              size="sm"
            />
          </div>
          <Slider label="السماكة" value={style.w} min={1.5} max={9} step={0.5} onChange={(v) => onChange({ w: v })} />
        </div>
      </Section>
      <Section title="اللون">
        <Swatches value={style.color} onChange={(c) => c && onChange({ color: c })} />
      </Section>
    </>
  );
}

/* ---------- phone strips (compact, one screen-width tall) ---------- */

export function LineStrip({ style, onChange }: { style: LineStyle; onChange: (patch: Partial<LineStyle>) => void }) {
  const active = matchPreset(style);
  return (
    <div className="px-3 pt-2.5 pb-2.5 grid grid-cols-1 gap-2">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3">
        {LINE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.style)}
            className={clsx("w-[78px] shrink-0 rounded-xl px-1.5 pt-0.5 pb-1 border text-center", active === p.id ? "bg-ice/15 border-ice text-white" : "bg-white/[0.04] border-white/[0.06] text-silver")}
          >
            <LinePreview style={p.style} color={active === p.id ? "#4DA8FF" : "#ffffff"} />
            <span className="block text-[11px] font-bold leading-none">{p.label}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Seg<Pattern>
          className="flex-1"
          value={style.pattern}
          onChange={(v) => onChange({ pattern: v })}
          options={[
            { v: "plain", icon: <Minus size={16} />, title: "مستقيم" },
            { v: "zigzag", icon: <Activity size={16} />, title: "زقزاق" },
            { v: "wave", icon: <Spline size={16} />, title: "موجة" },
          ]}
          size="sm"
        />
        <Seg<Dash>
          className="flex-1"
          value={style.dash}
          onChange={(v) => onChange({ dash: v })}
          options={[
            { v: "solid", icon: <DashIcon dash="solid" />, title: "متصل" },
            { v: "dashed", icon: <DashIcon dash="dashed" />, title: "متقطع" },
            { v: "dotted", icon: <DashIcon dash="dotted" />, title: "منقط" },
          ]}
          size="sm"
        />
        <Seg<Heads>
          className="flex-1"
          value={style.heads}
          onChange={(v) => onChange({ heads: v })}
          options={[
            { v: "none", icon: <Minus size={16} />, title: "بدون سهم" },
            { v: "end", icon: <ArrowRight size={16} className="rotate-180" />, title: "سهم" },
            { v: "both", icon: <ArrowLeftRight size={16} />, title: "سهمين" },
          ]}
          size="sm"
        />
      </div>
      <ColorRow value={style.color} onPick={(c) => c && onChange({ color: c })} />
    </div>
  );
}

export function ShapeStrip({ kind, style, onKind, onChange }: { kind: ShapeKind; style: ShapeStyle; onKind: (k: ShapeKind) => void; onChange: (patch: Partial<ShapeStyle>) => void }) {
  return (
    <div className="px-3 pt-2.5 pb-2.5 grid grid-cols-1 gap-2">
      <div className="flex gap-1.5">
        <Seg<ShapeKind>
          className="w-[132px] shrink-0"
          value={kind}
          onChange={onKind}
          options={[
            { v: "rect", icon: <Square size={16} />, title: "مربع" },
            { v: "ellipse", icon: <Circle size={16} />, title: "دائرة" },
            { v: "tri", icon: <Triangle size={16} />, title: "مثلث" },
          ]}
          size="sm"
        />
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-w-0">
          {SHAPE_PRESETS.map((p) => {
            const on = p.style.stroke === style.stroke && p.style.fill === style.fill && p.style.dash === style.dash && Math.abs(p.style.fo - style.fo) < 0.01;
            return (
              <button key={p.id} type="button" onClick={() => onChange(p.style)} title={p.label} className={clsx("h-9 w-11 shrink-0 rounded-[10px] border grid place-items-center", on ? "bg-ice/15 border-ice" : "bg-white/[0.04] border-white/[0.06]")}>
                <svg viewBox="0 0 40 26" className="w-7 h-5" aria-hidden>
                  <rect x="3" y="3" width="34" height="20" rx="3" fill={p.style.fill ?? "none"} fillOpacity={p.style.fill ? Math.max(0.25, p.style.fo) : 0} stroke={p.style.stroke} strokeWidth="2.4" strokeDasharray={p.style.dash === "dashed" ? "5 3" : undefined} />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-[11px] font-bold text-silver/80 shrink-0 w-10">تعبئة</span>
        <ColorRow value={style.fill} allowNone onPick={(c) => onChange({ fill: c })} />
      </div>
      {style.fill && <Slider label="الشفافية" value={Math.round(style.fo * 100)} min={5} max={100} step={5} onChange={(v) => onChange({ fo: v / 100 })} format={(v) => `${v}%`} />}
    </div>
  );
}

function ColorRow({ value, onPick, allowNone }: { value: string | null; onPick: (c: string | null) => void; allowNone?: boolean }) {
  const list = ["#FFFFFF", "#1C2D5A", "#4DA8FF", "#E7B53C", "#141414", "#E84C3D", "#F2994A", "#FFE14D", "#7CCF84", "#9B6BDF", "#FF7AB6", "#C7CED9"];
  const v = value?.toLowerCase() ?? null;
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-w-0 py-1 -my-1 px-1 -mx-1">
      {allowNone && (
        <button type="button" onClick={() => onPick(null)} aria-label="بدون" className={clsx("relative h-7 w-7 shrink-0 rounded-full border border-white/25 overflow-hidden", v === null && "ring-2 ring-ice ring-offset-2 ring-offset-navy")}>
          <span className="absolute inset-0 m-auto h-[1.5px] w-[130%] -translate-x-[12%] rotate-45 bg-error" />
        </button>
      )}
      {list.map((c) => (
        <button key={c} type="button" onClick={() => onPick(c)} aria-label={c} className={clsx("h-7 w-7 shrink-0 rounded-full border border-white/25", v === c.toLowerCase() && "ring-2 ring-ice ring-offset-2 ring-offset-navy")} style={{ background: c }} />
      ))}
    </div>
  );
}

export function DashIcon({ dash }: { dash: Dash }) {
  return (
    <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden>
      <line x1="2" y1="5" x2="20" y2="5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray={dash === "dashed" ? "5 4" : dash === "dotted" ? "0.1 4.4" : undefined} />
    </svg>
  );
}

/* ---------- shape tool options ---------- */

export function ShapeOptions({ kind, style, onKind, onChange, compact }: { kind: ShapeKind; style: ShapeStyle; onKind: (k: ShapeKind) => void; onChange: (patch: Partial<ShapeStyle>) => void; compact?: boolean }) {
  return (
    <>
      <Section title={compact ? undefined : "الشكل"}>
        <div className="grid grid-cols-1 gap-2">
          <Seg<ShapeKind>
            value={kind}
            onChange={onKind}
            options={[
              { v: "rect", icon: <Square size={16} />, label: "مربع" },
              { v: "ellipse", icon: <Circle size={16} />, label: "دائرة" },
              { v: "tri", icon: <Triangle size={16} />, label: "مثلث" },
            ]}
            size="sm"
          />
          <div className={clsx(compact ? "flex gap-1.5 overflow-x-auto no-scrollbar" : "grid grid-cols-4 gap-1.5")}>
            {SHAPE_PRESETS.map((p) => {
              const on = p.style.stroke === style.stroke && p.style.fill === style.fill && p.style.dash === style.dash && Math.abs(p.style.fo - style.fo) < 0.01;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange(p.style)}
                  className={clsx("rounded-xl p-1.5 border text-[11px] font-bold flex flex-col items-center gap-1", compact && "w-[70px] shrink-0", on ? "bg-ice/15 border-ice text-white" : "bg-white/[0.04] border-white/[0.06] text-silver")}
                >
                  <svg viewBox="0 0 40 26" className="w-9 h-6" aria-hidden>
                    <rect x="3" y="3" width="34" height="20" rx="3" fill={p.style.fill ?? "none"} fillOpacity={p.style.fill ? Math.max(0.25, p.style.fo) : 0} stroke={p.style.stroke} strokeWidth="2" strokeDasharray={p.style.dash === "dashed" ? "5 3" : undefined} />
                  </svg>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </Section>
      <ShapeStyleFields style={style} onChange={onChange} />
    </>
  );
}

export function ShapeStyleFields({ style, onChange, onStart, onEnd }: { style: ShapeStyle; onChange: (patch: Partial<ShapeStyle>) => void; onStart?: () => void; onEnd?: () => void }) {
  return (
    <>
      <Section title="التعبئة">
        <Swatches value={style.fill} allowNone noneLabel="بدون تعبئة (إطار فقط)" onChange={(c) => onChange({ fill: c })} />
        {style.fill && (
          <div className="mt-3">
            <Slider label="الشفافية" value={Math.round(style.fo * 100)} min={5} max={100} step={5} onStart={onStart} onEnd={onEnd} onChange={(v) => onChange({ fo: v / 100 })} format={(v) => `${v}%`} />
          </div>
        )}
      </Section>
      <Section title="الإطار">
        <Swatches value={style.sw > 0 ? style.stroke : null} allowNone noneLabel="بدون إطار" onChange={(c) => onChange(c ? { stroke: c, sw: style.sw > 0 ? style.sw : 2.5 } : { sw: 0 })} />
        {style.sw > 0 && (
          <div className="mt-3 grid gap-2">
            <Seg<Dash>
              value={style.dash}
              onChange={(v) => onChange({ dash: v })}
              options={[
                { v: "solid", icon: <DashIcon dash="solid" />, title: "متصل" },
                { v: "dashed", icon: <DashIcon dash="dashed" />, title: "متقطع" },
                { v: "dotted", icon: <DashIcon dash="dotted" />, title: "منقط" },
              ]}
              size="sm"
            />
            <Slider label="السماكة" value={style.sw} min={1} max={10} step={0.5} onStart={onStart} onEnd={onEnd} onChange={(v) => onChange({ sw: v })} />
          </div>
        )}
      </Section>
    </>
  );
}
