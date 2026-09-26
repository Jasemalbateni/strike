"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";
import { PLATFORMS, platformLabel, platformShort, statusLabel, type Platform, type PostStatus } from "@/lib/types";

/* ---------- Modal ---------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-navy-900/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={clsx(
          "relative w-full bg-white rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-pop)] max-h-[92dvh] flex flex-col fade-up",
          wide ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
      >
        <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-3">
          <h2 className="text-navy font-extrabold text-[19px]">{title}</h2>
          <button onClick={onClose} className="p-2 -me-2 rounded-lg text-ink-2 hover:bg-silver-100 hover:text-navy" aria-label="إغلاق">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 sm:px-6 pb-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 sm:px-6 py-4 border-t border-silver-200 flex items-center justify-between gap-3 bg-silver-100/60 rounded-b-3xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- form bits ---------- */
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-bold text-navy">{label}</span>
      {children}
    </label>
  );
}

export function PlatformSelect({
  value,
  onChange,
  includeGeneral = true,
}: {
  value: Platform;
  onChange: (p: Platform) => void;
  includeGeneral?: boolean;
}) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value as Platform)}>
      {PLATFORMS.filter((p) => includeGeneral || p.value !== "general").map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

/* ---------- chips ---------- */
const PLATFORM_STYLE: Record<Platform, string> = {
  instagram: "bg-navy text-white",
  tiktok: "bg-navy-900 text-white",
  snapchat: "bg-gold-100 text-navy-900",
  youtube: "bg-error-100 text-error",
  x: "bg-silver-200 text-navy-900",
  whatsapp: "bg-ice-100 text-navy",
  general: "bg-silver-100 text-ink-2",
};

export function PlatformChip({ platform, full = false, className }: { platform: Platform; full?: boolean; className?: string }) {
  return (
    <span className={clsx("chip en tracking-wide", PLATFORM_STYLE[platform], className)} title={platformLabel(platform)}>
      {full ? platformLabel(platform) : platformShort(platform)}
    </span>
  );
}

const STATUS_STYLE: Record<PostStatus, string> = {
  idea: "bg-silver-100 text-ink-2",
  draft: "bg-navy-50 text-navy",
  review: "bg-gold-100 text-navy-900",
  approved: "bg-ice-100 text-navy",
  scheduled: "bg-ice text-navy-900",
  published: "bg-navy text-white",
};
export function StatusChip({ status, className }: { status: PostStatus; className?: string }) {
  return <span className={clsx("chip", STATUS_STYLE[status], className)}>{statusLabel(status)}</span>;
}

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("");

const AVATAR_TONE = {
  navy: "bg-navy text-white",
  ice: "bg-ice text-navy-900",
  light: "bg-navy-50 text-navy",
  white: "bg-white text-navy border border-silver-200",
} as const;

export function Avatar({ name, size = 28, tone = "navy", className }: { name: string; size?: number; tone?: keyof typeof AVATAR_TONE; className?: string }) {
  return (
    <span
      title={name}
      className={clsx("inline-grid place-items-center rounded-full font-extrabold shrink-0 leading-none", AVATAR_TONE[tone], className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.42) }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-dashed border-silver bg-white/60 p-8 text-center">
      <div className="text-navy font-extrabold">{title}</div>
      {hint && <p className="text-ink-2 text-sm mt-1">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, count, action }: { children: ReactNode; count?: number; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-navy font-extrabold text-[17px] flex items-center gap-2">
        {children}
        {count !== undefined && <span className="num text-ink-2 text-sm font-bold">{count}</span>}
      </h3>
      {action}
    </div>
  );
}

export function fmtNum(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}
