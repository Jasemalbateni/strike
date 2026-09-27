"use client";

import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/**
 * Shared drag sensors:
 * - mouse: small distance so clicks still work
 * - touch: long-press (so lists keep scrolling with a normal swipe on iPhone/iPad)
 * - keyboard: only for sortable lists that have a dedicated drag handle
 */
export function useDndSensors(opts: { keyboard?: boolean } = {}) {
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: 6 } });
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } });
  const keyboard = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
  return useSensors(mouse, touch, opts.keyboard === false ? null : keyboard);
}
