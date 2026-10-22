"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell as BellIcon, X } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/notifications";

/** unread count for the signed-in user, live; pops a small toast when a new notification lands */
export function useUnread(userId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState(0);
  const [fresh, setFresh] = useState<Notification | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .is("read_at", null)
        .neq("channel", "whatsapp")
        .then(({ count: c }) => alive && setCount(c ?? 0));
    load();
    const ch = supabase
      .channel(`notif-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, (payload) => {
        load();
        const n = payload.new as Notification | undefined;
        if (payload.eventType === "INSERT" && n && n.channel !== "whatsapp") setFresh(n);
      })
      .subscribe();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("notifications:read", onFocus);
    return () => {
      alive = false;
      supabase.removeChannel(ch);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("notifications:read", onFocus);
    };
  }, [supabase, userId]);

  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 8000);
    return () => clearTimeout(t);
  }, [fresh]);

  return { count, fresh, dismiss: () => setFresh(null) };
}

export function BellLink({ count, variant }: { count: number; variant: "rail" | "bar" }) {
  const pathname = usePathname();
  const active = pathname === "/notifications";
  if (variant === "bar")
    return (
      <Link href="/notifications" className={clsx("relative h-11 w-11 grid place-items-center", active ? "text-ice" : "text-silver")} aria-label={count ? `التنبيهات — ${count} جديدة` : "التنبيهات"}>
        <BellIcon size={20} />
        {count > 0 && <Badge count={count} className="absolute top-1.5 end-1.5" />}
      </Link>
    );
  return (
    <Link
      href="/notifications"
      title="التنبيهات"
      className={clsx(
        "relative flex items-center justify-center xl:justify-start gap-3 rounded-xl h-11 xl:px-3.5 text-[15px] font-bold transition",
        active ? "bg-white/10 text-white" : "text-silver hover:bg-white/5 hover:text-white",
      )}
    >
      <span className="relative">
        <BellIcon size={20} className={active ? "text-ice" : ""} />
        {count > 0 && <Badge count={count} className="absolute -top-2 -end-2.5 xl:hidden" />}
      </span>
      <span className="hidden xl:inline">التنبيهات</span>
      {count > 0 && <Badge count={count} className="hidden xl:grid ms-auto" />}
    </Link>
  );
}

function Badge({ count, className }: { count: number; className?: string }) {
  return (
    <span className={clsx("min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-navy-900 text-[11px] font-extrabold grid place-items-center num leading-none ring-2 ring-navy", className)}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function FreshToast({ n, onClose }: { n: Notification; onClose: () => void }) {
  return (
    <div role="status" className="fixed z-50 top-[calc(64px+env(safe-area-inset-top))] md:top-5 inset-x-3 md:inset-x-auto md:end-5 md:w-[380px] fade-up">
      <div className="rounded-2xl bg-navy text-white shadow-[var(--shadow-pop)] p-3.5 flex items-start gap-3 border border-white/10">
        <span className="h-9 w-9 shrink-0 rounded-xl bg-gold text-navy-900 grid place-items-center">
          <BellIcon size={18} />
        </span>
        <Link href="/notifications" onClick={onClose} className="min-w-0 flex-1">
          <div className="text-[11px] text-silver font-bold">تنبيه جديد</div>
          <div className="font-bold text-[14.5px] leading-snug">{n.title}</div>
          {n.body && <div className="text-silver text-[13px] mt-0.5 line-clamp-2">{n.body}</div>}
        </Link>
        <button type="button" onClick={onClose} className="h-8 w-8 -m-1 grid place-items-center rounded-lg text-silver hover:text-white" aria-label="إغلاق">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
