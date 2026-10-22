"use client";

import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";

/** horizontal 0–5 bar; optional tick for the previous value */
export function ScoreBar({ label, value, prev, color, strong }: { label: string; value: number | null; prev?: number | null; color: string; strong?: boolean }) {
  const pct = (v: number) => `${(v / 5) * 100}%`;
  const delta = value !== null && prev != null ? value - prev : null;
  return (
    <div className="grid grid-cols-[minmax(92px,128px)_1fr_auto] items-center gap-2.5" title={value === null ? `${label}: لم يُقيّم` : `${label}: ${value.toFixed(1)} من 5${prev != null ? ` (السابق ${prev.toFixed(1)})` : ""}`}>
      <span className={clsx("text-[13px] truncate", strong ? "font-extrabold text-navy" : "font-bold text-ink-2")}>{label}</span>
      <span className="relative h-2.5 rounded-full bg-silver-100">
        {value !== null && <span className="absolute inset-y-0 start-0 rounded-full" style={{ width: pct(value), background: color }} />}
        {prev != null && <span className="absolute -top-1 -bottom-1 w-[2px] rounded bg-navy/60" style={{ insetInlineStart: `calc(${pct(prev)} - 1px)` }} aria-hidden />}
      </span>
      <span className="num text-[13px] font-bold text-navy w-[58px] text-end whitespace-nowrap">
        {value === null ? "—" : value.toFixed(1)}
        {delta !== null && Math.abs(delta) >= 0.05 && <span className={clsx("ms-1 text-[11px]", delta > 0 ? "text-[#1a8f5f]" : "text-error")}>{delta > 0 ? "▲" : "▼"}</span>}
      </span>
    </div>
  );
}

/** 5 small dots — compact score display */
export function Dots({ value, color = "#1C2D5A" }: { value: number | null; color?: string }) {
  const v = value ?? 0;
  return (
    <span className="inline-flex gap-[3px] align-middle" aria-label={value === null ? "لم يُقيّم" : `${value.toFixed(1)} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-2 w-2 rounded-full" style={{ background: v >= i - 0.25 ? color : "#E3E8EF" }} />
      ))}
    </span>
  );
}

/** line over time on a fixed scale with hover crosshair + tooltip */
export function TrendChart({
  points,
  min = 1,
  max = 5,
  unit = "",
  invert = false,
  height = 150,
  label,
}: {
  points: { date: string; value: number }[];
  min?: number;
  max?: number;
  unit?: string;
  /** lower is better (sprint times): flip so "up" still means better */
  invert?: boolean;
  height?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(520);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e.contentRect.width && setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!points.length) return null;
  const W = w, H = height, PL = 30, PR = 14, PT = 12, PB = 24;
  const lo = Math.min(min, ...points.map((p) => p.value));
  const hi = Math.max(max, ...points.map((p) => p.value));
  const span = hi - lo || 1;
  const x = (i: number) => (points.length === 1 ? (PL + W - PR) / 2 : PL + (i * (W - PL - PR)) / (points.length - 1));
  const y = (v: number) => {
    const t = (v - lo) / span;
    return PT + (H - PT - PB) * (invert ? t : 1 - t);
  };
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((t) => lo + span * t);
  const h = hover !== null ? points[hover] : null;

  return (
    <div className="relative" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} dir="ltr" className="w-full" style={{ height, direction: "ltr" }} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="#E3E8EF" strokeWidth="1" />
            <text x={PL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#6B7280" className="num">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {h && <line x1={x(hover!)} x2={x(hover!)} y1={PT} y2={H - PB} stroke="#1C2D5A" strokeOpacity="0.25" strokeWidth="1" />}
        <path d={path} fill="none" stroke="#1C2D5A" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4} fill="#4DA8FF" stroke="#fff" strokeWidth="2" />
            <rect x={x(i) - 18} y={0} width={36} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} onTouchStart={() => setHover(i)} />
          </g>
        ))}
        {points.length > 1 && (
          <>
            <text x={x(0)} y={H - 6} textAnchor="start" fontSize="11" fill="#6B7280">
              {format(parseISO(points[0].date), "d MMM", { locale: ar })}
            </text>
            <text x={x(points.length - 1)} y={H - 6} textAnchor="end" fontSize="11" fill="#6B7280">
              {format(parseISO(points[points.length - 1].date), "d MMM", { locale: ar })}
            </text>
          </>
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-0 rounded-lg bg-navy text-white text-[12px] px-2.5 py-1.5 shadow-lg" style={{ left: `clamp(0px, calc(${(x(hover!) / W) * 100}% - 55px), calc(100% - 110px))` }} dir="rtl">
          <div className="text-silver">{format(parseISO(h.date), "d MMMM yyyy", { locale: ar })}</div>
          <div className="font-bold num">
            {Number.isInteger(h.value) ? h.value : h.value.toFixed(h.value < 10 ? 2 : 1)} {unit}
          </div>
        </div>
      )}
    </div>
  );
}

/** vertical bars, one series, labels under each bar, value on hover (and on the last bar) */
export function BarChart({ bars, color = "#2a78d6", unit = "", height = 170, label, format: fmtV = (v: number) => String(Math.round(v)) }: { bars: { label: string; value: number; hint?: string }[]; color?: string; unit?: string; height?: number; label: string; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!bars.length) return null;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const show = hover ?? bars.length - 1;
  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
      <div className="flex items-end gap-[2px]" style={{ height }} dir="ltr">
        {bars.map((b, i) => (
          <div key={i} className="flex-1 h-full flex flex-col justify-end items-center relative cursor-default" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
            {i === show && (
              <span className="absolute -top-0.5 num text-[11.5px] font-bold text-navy whitespace-nowrap" style={{ bottom: `calc(${(b.value / max) * 100}% + 4px)`, top: "auto" }}>
                {fmtV(b.value)}
                {unit && ` ${unit}`}
              </span>
            )}
            <span className="w-full max-w-[38px] rounded-t-[4px] transition-opacity" style={{ height: `${Math.max(b.value ? 2 : 0, (b.value / max) * 100)}%`, background: color, opacity: hover === null || hover === i ? 1 : 0.45 }} />
          </div>
        ))}
      </div>
      <div className="h-px bg-silver-200" />
      <div className="flex gap-[2px]" dir="ltr">
        {bars.map((b, i) => (
          <span key={i} className={clsx("flex-1 text-center text-[10.5px] truncate", i === show ? "text-navy font-bold" : "text-ink-2")} title={b.hint ?? b.label}>
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
