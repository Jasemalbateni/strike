"use client";

import { useEffect, useRef } from "react";
import { mountLab } from "./engine";
import "./lab.css";

/** المختبر الحركي: mounts the animated, plain-DOM lab into this container and tears it down on leave. */
export default function MovementLab() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return mountLab(ref.current);
  }, []);
  return <div ref={ref} className="mlab" />;
}
