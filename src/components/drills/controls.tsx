"use client";

/* Compact dark-theme controls for the drill studio. */
import { useRef, type ReactNode } from "react";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { SWATCHES } from "@/lib/drills/colors";

export function Section({ title, children, action, className }: { title?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("px-3.5 py-3 border-b border-white/[0.07] last:border-b-0", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-2">
          {title && <div className="text-[11.5px] font-bold text-silver/80 tracking-wide">{title}</div>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export type SegOption<T extends string> = { v: T; label?: string; icon?: ReactNode; title?: string };

export function Seg<T extends string>({ value, options, onChange, size = "md", className }: { value: T | null; options: SegOption<T>[]; onChange: (v: T) => void; size?: "sm" | "md"; className?: string }) {
  return (
    <div className={clsx("flex min-w-0 rounded-xl bg-white/[0.06] p-0.5 gap-0.5", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          title={o.title ?? o.label}
          onClick={() => onChange(o.v)}
          className={clsx(
            "flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 rounded-[10px] font-bold transition-colors",
            size === "sm" ? "h-8 text-[12px] px-1.5" : "h-9 text-[12.5px] px-2",
            value === o.v ? "bg-ice text-navy-900 shadow-sm" : "text-silver hover:text-white hover:bg-white/[0.06]",
          )}
        >
          {o.icon}
          {o.label && <span className="truncate">{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

export function Swatches({ value, onChange, allowNone, noneLabel = "بدون" }: { value: string | null; onChange: (c: string | null) => void; allowNone?: boolean; noneLabel?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const v = value?.toLowerCase() ?? null;
  const custom = v && !SWATCHES.some((s) => s.c.toLowerCase() === v) ? value : null;
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="الألوان">
      {allowNone && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          title={noneLabel}
          onClick={() => onChange(null)}
          className={clsx("relative h-7 w-7 rounded-full border border-white/25 overflow-hidden", value === null && "ring-2 ring-ice ring-offset-2 ring-offset-navy")}
        >
          <span className="absolute inset-0 m-auto h-[1.5px] w-[130%] -translate-x-[12%] rotate-45 bg-error" />
        </button>
      )}
      {SWATCHES.map((s) => (
        <button
          key={s.c}
          type="button"
          role="radio"
          aria-checked={v === s.c.toLowerCase()}
          title={s.name}
          onClick={() => onChange(s.c)}
          className={clsx("h-7 w-7 rounded-full border border-white/20 transition-transform active:scale-90", v === s.c.toLowerCase() && "ring-2 ring-ice ring-offset-2 ring-offset-navy")}
          style={{ background: s.c }}
        />
      ))}
      <button
        type="button"
        title="لون مخصص"
        onClick={() => input.current?.click()}
        className={clsx("relative h-7 w-7 rounded-full border border-white/30 grid place-items-center text-white", custom && "ring-2 ring-ice ring-offset-2 ring-offset-navy")}
        style={{ background: custom ?? "conic-gradient(#e84c3d, #ffe14d, #7ccf84, #4da8ff, #9b6bdf, #e84c3d)" }}
      >
        {!custom && <Plus size={14} strokeWidth={3} className="drop-shadow" />}
        <input ref={input} type="color" className="absolute inset-0 opacity-0 pointer-events-none" value={value ?? "#ffffff"} onChange={(e) => onChange(e.target.value)} tabIndex={-1} aria-label="لون مخصص" />
      </button>
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onStart,
  onEnd,
  format,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  format?: (v: number) => string;
  label?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex min-w-0 items-center gap-3">
      {label && <span className="text-[12px] text-silver shrink-0 w-14">{label}</span>}
      <input
        type="range"
        dir="ltr"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onStart}
        onPointerUp={onEnd}
        onKeyDown={onStart}
        onKeyUp={onEnd}
        onChange={(e) => onChange(Number(e.target.value))}
        className="studio-range flex-1 min-w-0"
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
        aria-label={label}
      />
      <span className="num text-[13px] text-white w-11 text-left shrink-0" dir="ltr">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function ToolButton({ active, onClick, title, children, badge, className, disabled }: { active?: boolean; onClick?: () => void; title: string; children: ReactNode; badge?: string; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "relative grid place-items-center rounded-xl transition-colors disabled:opacity-35 disabled:pointer-events-none",
        active ? "bg-ice text-navy-900" : "text-silver hover:text-white hover:bg-white/[0.08]",
        className ?? "h-11 w-11",
      )}
    >
      {children}
      {badge && <span className="absolute -top-0.5 -left-0.5 num text-[10px] min-w-4 h-4 px-1 rounded-full bg-gold text-navy-900 font-bold grid place-items-center">{badge}</span>}
    </button>
  );
}

export function ActionButton({ onClick, children, title, danger, className, disabled }: { onClick: () => void; children: ReactNode; title?: string; danger?: boolean; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "h-9 px-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 text-[12.5px] font-bold transition-colors disabled:opacity-35 disabled:pointer-events-none",
        danger ? "bg-error/15 text-[#ff8a8a] hover:bg-error hover:text-white" : "bg-white/[0.07] text-white hover:bg-white/[0.13]",
        className,
      )}
    >
      {children}
    </button>
  );
}
