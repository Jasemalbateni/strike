"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** quietly records that the signed-in staff member is active (owner-only view on the Team page) */
export function usePresence() {
  const pathname = usePathname();
  const last = useRef(0);
  useEffect(() => {
    const supabase = createClient();
    const ping = (minGap: number) => {
      const now = Date.now();
      if (now - last.current < minGap) return;
      last.current = now;
      supabase.rpc("touch_presence", { p_path: window.location.pathname }).then(() => {});
    };
    ping(20_000);
    const onVis = () => document.visibilityState === "visible" && ping(120_000);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pathname]);
}
