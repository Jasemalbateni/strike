"use client";

import { useSyncExternalStore } from "react";

/** Reactive CSS media query. `serverDefault` is what the server (and first paint) assumes. */
export function useMediaQuery(query: string, serverDefault = true) {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => serverDefault,
  );
}
