"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Hand,
  ImageDown,
  Layers,
  Maximize,
  Minus,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Play,
  Plus,
  Shapes,
  Square,
  SquareDashedMousePointer,
  Trash2,
  Type,
  Undo2,
  Redo2,
  Users,
  Dumbbell,
  X,
  Settings2,
  CopyPlus,
} from "lucide-react";
import {
  artDims,
  cloneEl,
  continueFrame,
  defaultInk,
  elBounds,
  elCenter,
  equipment,
  isInside,
  LINE_PRESETS,
  makeArt,
  makeLine,
  makeShape,
  makeText,
  makeToken,
  mainColor,
  moveEl,
  rotateBoardEls,
  SHAPE_PRESETS,
  snapEnd,
  textDims,
  tokenRadius,
  TEAMS,
  tween,
  uid,
  withMainColor,
} from "@/lib/drills/board";
import { boxesIntersect, dist, normAngle, rotateP, simplify, unionBox, type Box } from "@/lib/drills/geometry";
import { boardSize } from "@/lib/drills/pitch";
import type { Board, El, LineEl, LineStyle, P, PenEl, Pitch, ShapeEl, ShapeKind, ShapeStyle } from "@/lib/drills/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { ArtPreview, ElementView, PitchLayer, TokenPreview } from "./render";
import PropsPanel, { selectionTitle, type PanelApi } from "./props-panel";
import PitchPanel from "./pitch-panel";
import { EquipmentGrid, LineOptions, LineStrip, PlayersGrid, ShapeOptions, ShapeStrip, type PaletteItem } from "./palette";
import { ToolButton } from "./controls";
import { canShareFiles, downloadBlob, exportBoardPng, shareFile } from "./export";

export type Tool = "select" | "line" | "shape" | "text" | "pen" | "hand";
export type EditorApi = { getBoard: () => Board; exportImage: () => Promise<void> };

type View = { x: number; y: number; k: number };

type Gesture =
  | { kind: "pending"; pid: number; start: P; cx: number; cy: number; hitId: string | null; shift: boolean; alt: boolean; ptype: string }
  | { kind: "move"; pid: number; start: P; orig: Map<string, El>; anchor: string; snapped: boolean; outside: boolean }
  | { kind: "marquee"; pid: number; start: P; base: string[] }
  | { kind: "draw-line"; pid: number; id: string; start: P }
  | { kind: "draw-shape"; pid: number; id: string; start: P }
  | { kind: "draw-pen"; pid: number; id: string; pts: P[] }
  | { kind: "handle"; pid: number; id: string; handle: string; start: P; orig: El; snapped: boolean }
  | { kind: "pan"; pid: number; sx: number; sy: number; v0: View }
  | { kind: "pinch"; d0: number; m0: P; v0: View }
  | { kind: "noop"; pid: number };

type Overlay = { marquee?: Box; guides?: { x?: number; y?: number }; trash?: "show" | "hot"; danger?: string[] };
type Ghost = { item: PaletteItem; x: number; y: number; over: boolean };
type Sheet = "players" | "equipment" | "lines" | "shapes" | "board" | "props" | "more" | "info";

let clipboard: El[] = [];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type Insets = { t: number; r: number; b: number; l: number };

function fitView(size: { w: number; h: number }, W: number, H: number, ins: Insets): View {
  if (!size.w || !size.h) return { x: 0, y: 0, k: 1 };
  const aw = Math.max(40, size.w - ins.l - ins.r), ah = Math.max(40, size.h - ins.t - ins.b);
  const k = Math.max(0.05, Math.min(aw / W, ah / H));
  return { k, x: W / 2 - (ins.l + aw / 2) / k, y: H / 2 - (ins.t + ah / 2) / k };
}

type Props = {
  initial: Board;
  readOnly?: boolean;
  onChange?: (b: Board) => void;
  onSave?: () => void;
  /** top bar start: back button + title */
  title: ReactNode;
  /** top bar end: save / submit … */
  actions?: ReactNode;
  banner?: ReactNode;
  /** read-only info panel (drill details) */
  info?: ReactNode;
  exportTitle: string;
  exportSubtitle?: string;
  ref?: Ref<EditorApi>;
};

export default function Editor({ initial, readOnly = false, onChange, onSave, title, actions, banner, info, exportTitle, exportSubtitle, ref }: Props) {
  // wide = side panels (desktop, landscape tablets); portrait tablets and phones get the dock layout
  const wide = useMediaQuery("(min-width: 1024px) and (orientation: landscape)");
  // roomy = enough width for two side columns; otherwise one inspector column swaps its content
  const roomy = useMediaQuery("(min-width: 1360px)");
  const coarse = useMediaQuery("(pointer: coarse)");

  /* ---------------- state ---------------- */
  const [board, setBoard] = useState<Board>(initial);
  const boardRef = useRef<Board>(initial);
  const [fi, setFi] = useState(0);
  const fiRef = useRef(0);
  const [sel, setSel] = useState<string[]>([]);
  const selRef = useRef<string[]>([]);
  const [tool, setToolState] = useState<Tool>("select");
  const toolRef = useRef<Tool>("select");
  const [lineStyle, setLineStyleState] = useState<LineStyle>(() => ({ color: defaultInk(initial.pitch), ...LINE_PRESETS[0].style }));
  const lineStyleRef = useRef(lineStyle);
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rect");
  const [shapeStyle, setShapeStyleState] = useState<ShapeStyle>(SHAPE_PRESETS[0].style);
  const shapeRef = useRef({ kind: "rect" as ShapeKind, style: SHAPE_PRESETS[0].style });
  const [multi, setMultiState] = useState(false);
  const multiRef = useRef(false);
  const [snapOn, setSnapOn] = useState(true);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const [viewOv, setViewOv] = useState<View | null>(null);
  const [ov, setOv] = useState<Overlay>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [playEls, setPlayEls] = useState<El[] | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [pitchOpen, setPitchOpen] = useState(false);
  const [hs, setHs] = useState({ u: 0, r: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ blob: Blob; name: string; url: string } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const attachSvg = useCallback((node: SVGSVGElement | null) => {
    svgRef.current = node;
    setSvgEl(node);
  }, []);
  const trashRef = useRef<HTMLDivElement>(null);
  const hist = useRef<{ past: Board[]; future: Board[] }>({ past: [], future: [] });
  const gRef = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const lastTap = useRef<{ id: string | null; t: number; x: number; y: number } | null>(null);
  const liveRef = useRef({ active: false, snapped: false });
  const moveFrame = useRef<{ raf: number; ev: { x: number; y: number; pid: number; shift: boolean; alt: boolean } | null }>({ raf: 0, ev: null });
  const spaceDown = useRef(false);
  const playRef = useRef(0);

  /* ---------------- derived ---------------- */
  const { W, H } = boardSize(board.pitch);
  const fIndex = Math.min(fi, board.frames.length - 1);
  const els = board.frames[fIndex].els;
  // phones: leave room for the floating controls (top) and the quick bar (bottom) so nothing jumps
  const fit = fitView(size, W, H, wide ? { t: 28, r: 28, b: 28, l: 28 } : readOnly ? { t: 52, r: 10, b: 12, l: 10 } : { t: 52, r: 10, b: 100, l: 10 });
  const view = viewOv ?? fit;
  const selSet = new Set(sel);
  const selEls = els.filter((e) => selSet.has(e.id));
  const shownEls = playEls ?? els;
  const hitW = (coarse ? 18 : 11) / view.k;
  const dangerSet = new Set(ov.danger ?? []);

  const viewRef = useRef(view);
  const fitRef = useRef(fit);
  const dimsRef = useRef({ W, H });
  useLayoutEffect(() => {
    viewRef.current = view;
    fitRef.current = fit;
    dimsRef.current = { W, H };
  });

  /* ---------------- core helpers ---------------- */
  function setB(next: Board) {
    boardRef.current = next;
    setBoard(next);
  }
  function emit() {
    onChange?.(boardRef.current);
  }
  function pushHist() {
    const h = hist.current;
    h.past.push(boardRef.current);
    if (h.past.length > 150) h.past.shift();
    h.future = [];
    setHs({ u: h.past.length, r: 0 });
  }
  function commit(next: Board) {
    pushHist();
    setB(next);
    emit();
  }
  function frameIdx(b: Board) {
    return Math.min(fiRef.current, b.frames.length - 1);
  }
  function mapEls(b: Board, fn: (list: El[]) => El[]): Board {
    const i = frameIdx(b);
    return { ...b, frames: b.frames.map((f, j) => (j === i ? { ...f, els: fn(f.els) } : f)) };
  }
  function curEls() {
    const b = boardRef.current;
    return b.frames[frameIdx(b)].els;
  }
  function findEl(id: string | null) {
    return id ? curEls().find((e) => e.id === id) : undefined;
  }
  function setSelection(ids: string[]) {
    selRef.current = ids;
    setSel(ids);
  }
  function setTool(t: Tool) {
    toolRef.current = t;
    setToolState(t);
    if (t !== "select" && t !== "hand") setMulti(false);
  }
  function setMulti(v: boolean) {
    multiRef.current = v;
    setMultiState(v);
  }
  function setView(v: View) {
    viewRef.current = v;
    setViewOv(v);
  }
  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
  }
  function setFrame(i: number) {
    fiRef.current = i;
    setFi(i);
    setSelection([]);
    setEditing(null);
  }
  function toWorld(cx: number, cy: number): P {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: v.x + (cx - r.left) / v.k, y: v.y + (cy - r.top) / v.k };
  }
  function overTrash(cx: number, cy: number) {
    const r = trashRef.current?.getBoundingClientRect();
    return !!r && cx >= r.left - 12 && cx <= r.right + 12 && cy >= r.top - 12 && cy <= r.bottom + 12;
  }

  /* ---------------- history ---------------- */
  function afterHistory(b: Board) {
    if (fiRef.current >= b.frames.length) {
      fiRef.current = b.frames.length - 1;
      setFi(b.frames.length - 1);
    }
    const ids = new Set(b.frames[frameIdx(b)].els.map((e) => e.id));
    setSelection(selRef.current.filter((id) => ids.has(id)));
    setEditing(null);
  }
  function undo() {
    const h = hist.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(boardRef.current);
    setB(prev);
    afterHistory(prev);
    setHs({ u: h.past.length, r: h.future.length });
    emit();
  }
  function redo() {
    const h = hist.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(boardRef.current);
    setB(next);
    afterHistory(next);
    setHs({ u: h.past.length, r: h.future.length });
    emit();
  }
  /** drop the live changes of a cancelled gesture */
  function revertGesture() {
    const g = gRef.current;
    if (!g) return;
    const touched = (g.kind === "move" || g.kind === "handle") && g.snapped;
    const drew = g.kind === "draw-line" || g.kind === "draw-shape" || g.kind === "draw-pen";
    if (touched || drew) {
      const prev = hist.current.past.pop();
      if (prev) setB(prev);
      setHs({ u: hist.current.past.length, r: hist.current.future.length });
    }
    gRef.current = null;
    setOv({});
  }

  /* ---------------- selection panel api ---------------- */
  function patchSel(fn: (el: El) => El) {
    const ids = new Set(selRef.current);
    if (!ids.size) return;
    commit(mapEls(boardRef.current, (list) => list.map((e) => (ids.has(e.id) ? fn(e) : e))));
  }
  const api: PanelApi = {
    patch: patchSel,
    begin: () => {
      liveRef.current = { active: true, snapped: false };
    },
    live: (fn) => {
      if (!liveRef.current.active) return patchSel(fn);
      if (!liveRef.current.snapped) {
        pushHist();
        liveRef.current.snapped = true;
      }
      const ids = new Set(selRef.current);
      setB(mapEls(boardRef.current, (list) => list.map((e) => (ids.has(e.id) ? fn(e) : e))));
    },
    end: () => {
      if (liveRef.current.snapped) emit();
      liveRef.current = { active: false, snapped: false };
    },
    duplicate,
    remove: removeSel,
    front: () => reorder(true),
    back: () => reorder(false),
    toggleLock: () => {
      const all = selEls.every((e) => e.lock);
      patchSel((e) => ({ ...e, lock: all ? undefined : true }));
    },
    align,
    distribute,
    renumber,
    editText: (id) => setEditing(id),
  };

  function duplicate() {
    const list = curEls().filter((e) => selRef.current.includes(e.id));
    if (!list.length) return;
    const off = boardRef.current.u * 0.7;
    const copies = list.map((e) => ({ ...cloneEl(e, off, off), lock: undefined }));
    commit(mapEls(boardRef.current, (l) => [...l, ...copies]));
    setSelection(copies.map((c) => c.id));
  }
  function removeSel() {
    const ids = new Set(selRef.current);
    if (!ids.size) return;
    commit(mapEls(boardRef.current, (l) => l.filter((e) => !ids.has(e.id))));
    setSelection([]);
    setEditing(null);
  }
  function reorder(front: boolean) {
    const ids = new Set(selRef.current);
    commit(
      mapEls(boardRef.current, (l) => {
        const a = l.filter((e) => ids.has(e.id));
        const b = l.filter((e) => !ids.has(e.id));
        return front ? [...b, ...a] : [...a, ...b];
      }),
    );
  }
  function align(how: "h" | "v") {
    const u = boardRef.current.u;
    const list = curEls().filter((e) => selRef.current.includes(e.id) && !e.lock);
    if (list.length < 2) return;
    const cs = list.map((e) => elCenter(e, u));
    const avg = how === "h" ? cs.reduce((s, c) => s + c.y, 0) / cs.length : cs.reduce((s, c) => s + c.x, 0) / cs.length;
    const moves = new Map(list.map((e, i) => [e.id, how === "h" ? { dx: 0, dy: avg - cs[i].y } : { dx: avg - cs[i].x, dy: 0 }]));
    commit(mapEls(boardRef.current, (l) => l.map((e) => (moves.has(e.id) ? moveEl(e, moves.get(e.id)!.dx, moves.get(e.id)!.dy) : e))));
  }
  function distribute(axis: "x" | "y") {
    const u = boardRef.current.u;
    const list = curEls()
      .filter((e) => selRef.current.includes(e.id) && !e.lock)
      .map((e) => ({ e, c: elCenter(e, u) }))
      .sort((a, b) => a.c[axis] - b.c[axis]);
    if (list.length < 3) return;
    const first = list[0].c[axis], last = list[list.length - 1].c[axis];
    const step = (last - first) / (list.length - 1);
    const moves = new Map(list.map((x, i) => [x.e.id, first + step * i - x.c[axis]]));
    commit(mapEls(boardRef.current, (l) => l.map((e) => (moves.has(e.id) ? moveEl(e, axis === "x" ? moves.get(e.id)! : 0, axis === "y" ? moves.get(e.id)! : 0) : e))));
  }
  function renumber() {
    const u = boardRef.current.u;
    const tokens = curEls()
      .filter((e) => selRef.current.includes(e.id) && e.t === "token")
      .map((e) => ({ e, c: elCenter(e, u) }))
      .sort((a, b) => b.c.x - a.c.x || a.c.y - b.c.y);
    const num = new Map(tokens.map((t, i) => [t.e.id, String(i + 1)]));
    commit(mapEls(boardRef.current, (l) => l.map((e) => (e.t === "token" && num.has(e.id) ? { ...e, text: num.get(e.id)! } : e))));
  }

  /* ---------------- tool styles (apply to selection too) ---------------- */
  function changeLineStyle(patch: Partial<LineStyle>) {
    const next = { ...lineStyleRef.current, ...patch };
    lineStyleRef.current = next;
    setLineStyleState(next);
    const ids = new Set(selRef.current);
    if (curEls().some((e) => ids.has(e.id) && (e.t === "line" || e.t === "pen"))) {
      patchSel((e) => {
        if (e.t === "line") return { ...e, ...patch };
        if (e.t === "pen") {
          const { pattern: _p, ...rest } = patch;
          void _p;
          return { ...e, ...rest };
        }
        return e;
      });
    }
  }
  function changeShapeStyle(patch: Partial<ShapeStyle>) {
    const next = { ...shapeRef.current.style, ...patch };
    shapeRef.current = { ...shapeRef.current, style: next };
    setShapeStyleState(next);
    const ids = new Set(selRef.current);
    if (curEls().some((e) => ids.has(e.id) && e.t === "shape")) patchSel((e) => (e.t === "shape" ? { ...e, ...patch } : e));
  }
  function changeShapeKind(k: ShapeKind) {
    shapeRef.current = { ...shapeRef.current, kind: k };
    setShapeKind(k);
    const ids = new Set(selRef.current);
    if (curEls().some((e) => ids.has(e.id) && e.t === "shape")) patchSel((e) => (e.t === "shape" ? { ...e, shape: k } : e));
  }

  /* ---------------- pitch ---------------- */
  function changePitch(patch: Partial<Pitch>) {
    const b = boardRef.current;
    let next: Board = { ...b, pitch: { ...b.pitch, ...patch } };
    if (patch.vertical !== undefined && patch.vertical !== b.pitch.vertical) {
      const before = boardSize(b.pitch);
      next = { ...next, frames: next.frames.map((f) => ({ ...f, els: rotateBoardEls(f.els, !!patch.vertical, before) })) };
    }
    if (patch.kind && patch.kind !== b.pitch.kind) {
      const a = boardSize({ ...b.pitch, vertical: next.pitch.vertical }), c = boardSize(next.pitch);
      const dx = (c.W - a.W) / 2, dy = (c.H - a.H) / 2;
      if (dx || dy) next = { ...next, frames: next.frames.map((f) => ({ ...f, els: f.els.map((e) => moveEl(e, dx, dy)) })) };
    }
    commit(next);
    setViewOv(null);
    const oldInk = defaultInk(b.pitch), ink = defaultInk(next.pitch);
    if (oldInk !== ink && lineStyleRef.current.color.toLowerCase() === oldInk.toLowerCase()) {
      const ls = { ...lineStyleRef.current, color: ink };
      lineStyleRef.current = ls;
      setLineStyleState(ls);
    }
  }
  function changeUnit(u: number, live: boolean) {
    const next = { ...boardRef.current, u };
    if (live) {
      if (!liveRef.current.snapped) {
        pushHist();
        liveRef.current.snapped = true;
      }
      setB(next);
    } else commit(next);
  }

  /* ---------------- adding ---------------- */
  function dropPoint(): P {
    const v = viewRef.current, s = sizeRef.current, { W: bw, H: bh } = dimsRef.current;
    const u = boardRef.current.u;
    const cx = clamp(v.x + s.w / 2 / v.k, bw * 0.12, bw * 0.88);
    const cy = clamp(v.y + s.h / 2 / v.k, bh * 0.12, bh * 0.88);
    const list = curEls();
    const offs = [0, 1, -1, 2, -2, 3, -3];
    for (let row = 0; row < 4; row++) {
      for (const o of offs) {
        const p = { x: cx + o * u * 1.3, y: cy + row * u * 1.3 };
        if (!list.some((e) => (e.t === "token" || e.t === "art" || e.t === "text") && Math.hypot(e.x - p.x, e.y - p.y) < u * 0.75)) return p;
      }
    }
    return { x: cx, y: cy };
  }
  function addItem(item: PaletteItem, p: P) {
    const b = boardRef.current;
    const el = item.kind === "token" ? makeToken(item.team, p, curEls()) : makeArt(item.key, p, b.pitch);
    commit(mapEls(b, (l) => [...l, el]));
    // with a single inspector column, selecting would swap the palette out after every add
    if (!wide || roomy) setSelection([el.id]);
    if (toolRef.current !== "select") setTool("select");
  }
  function ghostSize(item: PaletteItem) {
    const u = boardRef.current.u, k = viewRef.current.k;
    if (item.kind === "token") return Math.max(22, u * k);
    const e = equipment(item.key);
    return Math.max(22, (e?.size ?? 1) * u * k);
  }
  function onItemDown(e: React.PointerEvent<HTMLButtonElement>, item: PaletteItem) {
    if (readOnly || e.button > 0) return;
    const btn = e.currentTarget;
    const touch = e.pointerType !== "mouse";
    const st = { x0: e.clientX, y0: e.clientY, dragging: false };
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {}
    const lift = touch ? 46 : 0;
    const overBoard = (x: number, y: number) => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r || x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
      const p = toWorld(x, y);
      return isInside(p, dimsRef.current.W, dimsRef.current.H);
    };
    const move = (ev: PointerEvent) => {
      if (!st.dragging && Math.hypot(ev.clientX - st.x0, ev.clientY - st.y0) > 8) st.dragging = true;
      if (st.dragging) setGhost({ item, x: ev.clientX, y: ev.clientY - lift, over: overBoard(ev.clientX, ev.clientY - lift) });
    };
    const done = (ev: PointerEvent, cancelled: boolean) => {
      btn.removeEventListener("pointermove", move);
      btn.removeEventListener("pointerup", up);
      btn.removeEventListener("pointercancel", cancel);
      setGhost(null);
      if (cancelled) return;
      if (!st.dragging) {
        addItem(item, dropPoint());
        if (!wide) flash("أُضيف في الوسط — اسحبه لمكانه");
        return;
      }
      const x = ev.clientX, y = ev.clientY - lift;
      if (overBoard(x, y)) addItem(item, toWorld(x, y));
    };
    const up = (ev: PointerEvent) => done(ev, false);
    const cancel = (ev: PointerEvent) => done(ev, true);
    btn.addEventListener("pointermove", move);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", cancel);
  }

  /* ---------------- pointer gestures on the board ---------------- */
  function startPinch() {
    if (gRef.current && gRef.current.kind !== "pan" && gRef.current.kind !== "pinch") revertGesture();
    const [a, b] = [...pointers.current.values()];
    gRef.current = { kind: "pinch", d0: Math.max(1, dist(a, b)), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: viewRef.current };
    setOv({});
  }
  function zoomLimits() {
    const fk = fitRef.current.k;
    return { min: fk * 0.6, max: Math.max(fk * 8, 4) };
  }
  function zoomAt(cx: number, cy: number, k: number) {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const lim = zoomLimits();
    const nk = clamp(k, lim.min, lim.max);
    const wx = v.x + (cx - r.left) / v.k, wy = v.y + (cy - r.top) / v.k;
    setView({ k: nk, x: wx - (cx - r.left) / nk, y: wy - (cy - r.top) / nk });
  }
  function zoomBy(f: number) {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, viewRef.current.k * f);
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerType === "mouse" && e.button === 2) return;
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {}
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (pointers.current.size >= 2) {
      startPinch();
      return;
    }
    if (editing) setEditing(null);
    if (playEls || readOnly || e.button === 1 || spaceDown.current || toolRef.current === "hand") {
      gRef.current = { kind: "pan", pid: e.pointerId, sx: e.clientX, sy: e.clientY, v0: viewRef.current };
      return;
    }
    const target = e.target as Element;
    const handle = target.closest("[data-handle]")?.getAttribute("data-handle");
    const p = toWorld(e.clientX, e.clientY);
    let hitId = target.closest("[data-id]")?.getAttribute("data-id") ?? null;
    if (handle) {
      const [id, kind] = handle.split(":");
      const el = findEl(id);
      // a press on the middle of the element itself moves it, even if a (big, touch-sized) handle overlaps
      if (el && insideBody(el, p, boardRef.current.u)) hitId = el.id;
      else if (el) {
        gRef.current = { kind: "handle", pid: e.pointerId, id, handle: kind, start: p, orig: el, snapped: false };
        return;
      }
    }
    gRef.current = { kind: "pending", pid: e.pointerId, start: p, cx: e.clientX, cy: e.clientY, hitId, shift: e.shiftKey || e.metaKey || e.ctrlKey, alt: e.altKey, ptype: e.pointerType };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const pt = pointers.current.get(e.pointerId);
    if (pt) {
      pt.x = e.clientX;
      pt.y = e.clientY;
    }
    const g = gRef.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const r = svgRef.current!.getBoundingClientRect();
      const lim = zoomLimits();
      const k = clamp((g.v0.k * dist(a, b)) / g.d0, lim.min, lim.max);
      const wm = { x: g.v0.x + (g.m0.x - r.left) / g.v0.k, y: g.v0.y + (g.m0.y - r.top) / g.v0.k };
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      setView({ k, x: wm.x - (m.x - r.left) / k, y: wm.y - (m.y - r.top) / k });
      return;
    }
    if (g.pid !== e.pointerId) return;
    moveFrame.current.ev = { x: e.clientX, y: e.clientY, pid: e.pointerId, shift: e.shiftKey, alt: e.altKey };
    if (!moveFrame.current.raf) moveFrame.current.raf = requestAnimationFrame(flushMove);
  }

  function flushMove() {
    const mf = moveFrame.current;
    mf.raf = 0;
    const ev = mf.ev;
    mf.ev = null;
    const g = gRef.current;
    if (!ev || !g || g.kind === "pinch" || g.pid !== ev.pid) return;
    const p = toWorld(ev.x, ev.y);
    switch (g.kind) {
      case "pending": {
        const moved = Math.hypot(ev.x - g.cx, ev.y - g.cy);
        if (moved < (g.ptype === "mouse" ? 3 : 7)) return;
        beginDrag(g, p);
        flushAgain(ev);
        return;
      }
      case "pan": {
        const v = g.v0;
        setView({ ...v, x: v.x - (ev.x - g.sx) / v.k, y: v.y - (ev.y - g.sy) / v.k });
        return;
      }
      case "move":
        return applyMove(g, p, ev);
      case "marquee": {
        const box = { x0: Math.min(g.start.x, p.x), y0: Math.min(g.start.y, p.y), x1: Math.max(g.start.x, p.x), y1: Math.max(g.start.y, p.y) };
        const u = boardRef.current.u;
        const hit = curEls()
          .filter((e) => !e.lock && boxesIntersect(elBounds(e, u), box))
          .map((e) => e.id);
        setSelection([...new Set([...g.base, ...hit])]);
        setOv({ marquee: box });
        return;
      }
      case "draw-line": {
        let b = p;
        if (ev.shift) b = snapAngle(g.start, p);
        setB(mapEls(boardRef.current, (l) => l.map((e) => (e.id === g.id && e.t === "line" ? { ...e, b } : e))));
        return;
      }
      case "draw-shape": {
        let w = Math.abs(p.x - g.start.x), h = Math.abs(p.y - g.start.y);
        if (ev.shift) w = h = Math.max(w, h);
        const x = g.start.x + (Math.sign(p.x - g.start.x) * w) / 2, y = g.start.y + (Math.sign(p.y - g.start.y) * h) / 2;
        setB(mapEls(boardRef.current, (l) => l.map((e) => (e.id === g.id && e.t === "shape" ? { ...e, x, y, w: Math.max(2, w), h: Math.max(2, h) } : e))));
        return;
      }
      case "draw-pen": {
        const last = g.pts[g.pts.length - 1];
        if (dist(last, p) < 2 / viewRef.current.k) return;
        g.pts.push(p);
        const pts = g.pts.slice();
        setB(mapEls(boardRef.current, (l) => l.map((e) => (e.id === g.id && e.t === "pen" ? { ...e, pts } : e))));
        return;
      }
      case "handle":
        return applyHandle(g, p, ev.shift);
      default:
        return;
    }
  }
  function flushAgain(ev: { x: number; y: number; pid: number; shift: boolean; alt: boolean }) {
    moveFrame.current.ev = ev;
    flushMove();
  }

  function snapAngle(a: P, b: P): P {
    const d = dist(a, b);
    const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 12)) * (Math.PI / 12);
    return { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d };
  }

  function beginDrag(g: Extract<Gesture, { kind: "pending" }>, p: P) {
    const t = toolRef.current;
    const b = boardRef.current;
    const hit = findEl(g.hitId);
    if (t === "select") {
      if (hit && !hit.lock) {
        let ids = selRef.current;
        if (!ids.includes(hit.id)) ids = g.shift || multiRef.current ? [...ids, hit.id] : [hit.id];
        let movable = curEls().filter((e) => ids.includes(e.id) && !e.lock);
        let anchor = hit.id;
        if (g.alt) {
          // alt-drag duplicates
          const copies = movable.map((e) => ({ ...cloneEl(e, 0, 0), lock: undefined }));
          pushHist();
          setB(mapEls(b, (l) => [...l, ...copies]));
          const idx = movable.findIndex((e) => e.id === hit.id);
          anchor = copies[idx]?.id ?? copies[0].id;
          movable = copies;
          ids = copies.map((c) => c.id);
          gRef.current = { kind: "move", pid: g.pid, start: g.start, orig: new Map(movable.map((e) => [e.id, e])), anchor, snapped: true, outside: false };
        } else {
          gRef.current = { kind: "move", pid: g.pid, start: g.start, orig: new Map(movable.map((e) => [e.id, e])), anchor, snapped: false, outside: false };
        }
        setSelection(ids);
        setEditing(null);
        return;
      }
      gRef.current = { kind: "marquee", pid: g.pid, start: g.start, base: g.shift || multiRef.current ? selRef.current : [] };
      if (!g.shift && !multiRef.current) setSelection([]);
      return;
    }
    if (t === "line") {
      const a = snapEnd(g.start, p, curEls(), b.u);
      const el = makeLine(lineStyleRef.current, a, p);
      pushHist();
      setB(mapEls(b, (l) => [...l, el]));
      gRef.current = { kind: "draw-line", pid: g.pid, id: el.id, start: a };
      setSelection([el.id]);
      return;
    }
    if (t === "pen") {
      const ls = lineStyleRef.current;
      const el: PenEl = { id: uid(), t: "pen", pts: [g.start, p], color: ls.color, w: ls.w, dash: ls.dash, heads: ls.heads };
      pushHist();
      setB(mapEls(b, (l) => [...l, el]));
      gRef.current = { kind: "draw-pen", pid: g.pid, id: el.id, pts: [g.start, p] };
      setSelection([]);
      return;
    }
    if (t === "shape") {
      const s = shapeRef.current;
      const el = makeShape(s.kind, s.style, g.start.x, g.start.y, 2, 2);
      pushHist();
      setB(mapEls(b, (l) => [...l, el]));
      gRef.current = { kind: "draw-shape", pid: g.pid, id: el.id, start: g.start };
      setSelection([el.id]);
      return;
    }
    gRef.current = { kind: "noop", pid: g.pid };
  }

  function applyMove(g: Extract<Gesture, { kind: "move" }>, p: P, ev: { x: number; y: number; alt: boolean }) {
    const u = boardRef.current.u;
    let dx = p.x - g.start.x, dy = p.y - g.start.y;
    const anchorEl = g.orig.get(g.anchor);
    if (!anchorEl) return;
    const c0 = elCenter(anchorEl, u);
    let guides: Overlay["guides"];
    if (snapOn && !ev.alt) {
      const thr = 7 / viewRef.current.k;
      const nc = { x: c0.x + dx, y: c0.y + dy };
      const { W: bw, H: bh } = dimsRef.current;
      const xs = [bw / 2], ys = [bh / 2];
      for (const e of curEls()) {
        if (g.orig.has(e.id) || e.t === "line" || e.t === "pen") continue;
        const c = elCenter(e, u);
        xs.push(c.x);
        ys.push(c.y);
      }
      let bx: number | undefined, by: number | undefined, bdx = thr, bdy = thr;
      for (const x of xs) {
        if (Math.abs(x - nc.x) < bdx) {
          bdx = Math.abs(x - nc.x);
          bx = x;
        }
      }
      for (const y of ys) {
        if (Math.abs(y - nc.y) < bdy) {
          bdy = Math.abs(y - nc.y);
          by = y;
        }
      }
      if (bx !== undefined) dx = bx - c0.x;
      if (by !== undefined) dy = by - c0.y;
      if (bx !== undefined || by !== undefined) guides = { x: bx, y: by };
    }
    if (!g.snapped) {
      pushHist();
      g.snapped = true;
    }
    const { W: bw, H: bh } = dimsRef.current;
    const outside = !isInside({ x: c0.x + dx, y: c0.y + dy }, bw, bh) || overTrash(ev.x, ev.y);
    g.outside = outside;
    setB(mapEls(boardRef.current, (l) => l.map((e) => (g.orig.has(e.id) ? moveEl(g.orig.get(e.id)!, dx, dy) : e))));
    setOv({ guides, trash: outside ? "hot" : "show", danger: outside ? [...g.orig.keys()] : undefined });
  }

  function applyHandle(g: Extract<Gesture, { kind: "handle" }>, p: P, shift: boolean) {
    const el = g.orig;
    let next: El = el;
    const u = boardRef.current.u;
    if (g.handle === "rot" && "r" in el && "x" in el) {
      let ang = (Math.atan2(p.y - el.y, p.x - el.x) * 180) / Math.PI + 90;
      if (shift) ang = Math.round(ang / 15) * 15;
      else {
        const s45 = Math.round(ang / 45) * 45;
        if (Math.abs(ang - s45) < 5) ang = s45;
      }
      next = { ...el, r: normAngle(ang) } as El;
    } else if (g.handle === "scale" && "x" in el) {
      const c = { x: el.x, y: el.y };
      const f = dist(p, c) / Math.max(1, dist(g.start, c));
      if (el.t === "token") next = { ...el, s: clamp(el.s * f, 0.35, 4) };
      else if (el.t === "art") next = { ...el, s: clamp(el.s * f, 0.25, 6) };
      else if (el.t === "text") next = { ...el, size: clamp(Math.round(el.size * f), 6, 200) };
    } else if (g.handle.startsWith("c") && el.t === "shape") {
      const i = Number(g.handle.slice(1));
      const sx = i === 0 || i === 3 ? -1 : 1, sy = i < 2 ? -1 : 1;
      const c0 = { x: el.x, y: el.y };
      const opp = { x: -sx * (el.w / 2), y: -sy * (el.h / 2) };
      const pl0 = rotateP(p, -el.r, c0);
      const pl = { x: pl0.x - c0.x, y: pl0.y - c0.y };
      let w = Math.max(6, (pl.x - opp.x) * sx), h = Math.max(6, (pl.y - opp.y) * sy);
      if (shift) w = h = Math.max(w, h);
      const cl = { x: opp.x + (sx * w) / 2, y: opp.y + (sy * h) / 2 };
      const cw = rotateP({ x: c0.x + cl.x, y: c0.y + cl.y }, el.r, c0);
      next = { ...el, x: cw.x, y: cw.y, w, h };
    } else if (el.t === "line") {
      if (g.handle === "a") next = { ...el, a: shift ? snapAngle(el.b, p) : p };
      else if (g.handle === "b") next = { ...el, b: shift ? snapAngle(el.a, p) : p };
      else if (g.handle === "mid") {
        const m = { x: (el.a.x + el.b.x) / 2, y: (el.a.y + el.b.y) / 2 };
        next = { ...el, c: dist(m, p) < 5 / viewRef.current.k ? undefined : p };
      }
    }
    void u;
    if (!g.snapped) {
      pushHist();
      g.snapped = true;
    }
    setB(mapEls(boardRef.current, (l) => l.map((e) => (e.id === g.id ? next : e))));
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>, cancelled = false) {
    if (moveFrame.current.raf) {
      cancelAnimationFrame(moveFrame.current.raf);
      moveFrame.current.raf = 0;
      if (moveFrame.current.ev) flushMove();
    }
    pointers.current.delete(e.pointerId);
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
    const g = gRef.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) gRef.current = null;
      return;
    }
    if (g.pid !== e.pointerId) return;
    gRef.current = null;
    const b = boardRef.current;
    const u = b.u;
    switch (g.kind) {
      case "pending":
        if (!cancelled) tap(g, e);
        return;
      case "move": {
        setOv({});
        if (!g.snapped) return;
        if (g.outside && !cancelled) {
          setB(mapEls(b, (l) => l.filter((x) => !g.orig.has(x.id))));
          setSelection([]);
          flash(g.orig.size > 1 ? `حُذفت ${g.orig.size} عناصر` : "حُذف العنصر");
        }
        emit();
        return;
      }
      case "marquee":
        setOv({});
        return;
      case "draw-line": {
        const el = findEl(g.id) as LineEl | undefined;
        if (!el || dist(el.a, el.b) < 12 || cancelled) {
          revertDraw();
          return;
        }
        const others = curEls().filter((x) => x.id !== el.id);
        const bb = snapEnd(el.b, el.a, others, u);
        setB(mapEls(b, (l) => l.map((x) => (x.id === el.id ? { ...el, b: bb } : x))));
        emit();
        return;
      }
      case "draw-shape": {
        const el = findEl(g.id) as ShapeEl | undefined;
        if (!el || cancelled) return revertDraw();
        if (el.w < 10 && el.h < 10) {
          const w = u * 5, h = u * 3.4;
          setB(mapEls(b, (l) => l.map((x) => (x.id === el.id ? { ...el, x: g.start.x, y: g.start.y, w, h } : x))));
        }
        setTool("select");
        emit();
        return;
      }
      case "draw-pen": {
        const el = findEl(g.id) as PenEl | undefined;
        if (!el || el.pts.length < 2 || cancelled) return revertDraw();
        const pts = simplify(g.pts, 0.9 / viewRef.current.k);
        let total = 0;
        for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
        if (total < 10) return revertDraw();
        setB(mapEls(b, (l) => l.map((x) => (x.id === el.id ? { ...el, pts } : x))));
        emit();
        return;
      }
      case "handle": {
        if (!g.snapped) return;
        const el = findEl(g.id);
        if (el?.t === "line" && (g.handle === "a" || g.handle === "b")) {
          const others = curEls().filter((x) => x.id !== el.id);
          const fixed = g.handle === "a" ? { ...el, a: snapEnd(el.a, el.b, others, u) } : { ...el, b: snapEnd(el.b, el.a, others, u) };
          setB(mapEls(b, (l) => l.map((x) => (x.id === el.id ? fixed : x))));
        }
        emit();
        return;
      }
      default:
        return;
    }
  }
  function revertDraw() {
    const prev = hist.current.past.pop();
    if (prev) setB(prev);
    setHs({ u: hist.current.past.length, r: hist.current.future.length });
    setSelection([]);
  }

  function tap(g: Extract<Gesture, { kind: "pending" }>, e: React.PointerEvent) {
    const now = e.timeStamp;
    const lt = lastTap.current;
    const dbl = !!lt && lt.id === g.hitId && now - lt.t < 380 && Math.hypot(lt.x - g.cx, lt.y - g.cy) < 24;
    lastTap.current = { id: g.hitId, t: now, x: g.cx, y: g.cy };
    const t = toolRef.current;
    const hit = findEl(g.hitId);
    const b = boardRef.current;
    if (dbl && hit && (hit.t === "text" || hit.t === "token")) {
      lastTap.current = null;
      setSelection([hit.id]);
      setEditing(hit.id);
      return;
    }
    if (t === "text") {
      if (hit?.t === "text") {
        setSelection([hit.id]);
        setEditing(hit.id);
      } else {
        const el = makeText(g.start, defaultInk(b.pitch), b.u);
        commit(mapEls(b, (l) => [...l, el]));
        setSelection([el.id]);
        setEditing(el.id);
      }
      setTool("select");
      return;
    }
    if (t === "shape" && !hit) {
      const s = shapeRef.current;
      const el = makeShape(s.kind, s.style, g.start.x, g.start.y, b.u * 5, b.u * 3.4);
      commit(mapEls(b, (l) => [...l, el]));
      setSelection([el.id]);
      setTool("select");
      return;
    }
    if (hit) {
      if (g.shift || multiRef.current) {
        const cur = selRef.current;
        setSelection(cur.includes(hit.id) ? cur.filter((x) => x !== hit.id) : [...cur, hit.id]);
      } else setSelection([hit.id]);
    } else if (!g.shift && !multiRef.current) {
      setSelection([]);
    }
  }

  /* ---------------- effects: size, wheel, keyboard, body lock ---------------- */
  useLayoutEffect(() => {
    const el = wrapEl;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width), h = Math.round(entry.contentRect.height);
      const prev = sizeRef.current;
      if (prev.w === w && prev.h === h) return;
      sizeRef.current = { w, h };
      setSize({ w, h });
      // keep the same world point centred when the screen rotates / panels open
      setViewOv((v) => (v && prev.w ? { ...v, x: v.x + (prev.w - w) / 2 / v.k, y: v.y + (prev.h - h) / 2 / v.k } : v));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrapEl]);

  useEffect(() => {
    const svg = svgEl;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomy = e.ctrlKey || e.metaKey || (Math.abs(e.deltaX) < 0.5 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
      if (zoomy) {
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0025));
        const r = svg.getBoundingClientRect();
        const v = viewRef.current;
        const fk = fitRef.current.k;
        const k = clamp(v.k * f, fk * 0.6, Math.max(fk * 8, 4));
        const wx = v.x + (e.clientX - r.left) / v.k, wy = v.y + (e.clientY - r.top) / v.k;
        const nv = { k, x: wx - (e.clientX - r.left) / k, y: wy - (e.clientY - r.top) / k };
        viewRef.current = nv;
        setViewOv(nv);
      } else {
        const v = viewRef.current;
        const nv = { ...v, x: v.x + e.deltaX / v.k, y: v.y + e.deltaY / v.k };
        viewRef.current = nv;
        setViewOv(nv);
      }
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svgEl]);

  // keep the latest handlers for the window listeners
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useLayoutEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector("[role=dialog][aria-modal=true]")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "s") {
        e.preventDefault();
        onSave?.();
        return;
      }
      if (readOnly) return;
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && k === "d") {
        e.preventDefault();
        duplicate();
        return;
      }
      if (mod && k === "a") {
        e.preventDefault();
        setSelection(curEls().filter((x) => !x.lock).map((x) => x.id));
        return;
      }
      if (mod && k === "c") {
        clipboard = curEls().filter((x) => selRef.current.includes(x.id));
        try {
          localStorage.setItem("strike-board-clip", JSON.stringify(clipboard));
        } catch {}
        return;
      }
      if (mod && k === "v") {
        let items = clipboard;
        if (!items.length) {
          try {
            items = JSON.parse(localStorage.getItem("strike-board-clip") || "[]");
          } catch {}
        }
        if (!items.length) return;
        e.preventDefault();
        const off = boardRef.current.u * 0.7;
        const copies = items.map((x) => cloneEl(x, off, off));
        clipboard = copies;
        commit(mapEls(boardRef.current, (l) => [...l, ...copies]));
        setSelection(copies.map((c) => c.id));
        return;
      }
      if (k === "delete" || k === "backspace") {
        if (selRef.current.length) {
          e.preventDefault();
          removeSel();
        }
        return;
      }
      if (k === "escape") {
        setSelection([]);
        setTool("select");
        setSheet(null);
        return;
      }
      if (k.startsWith("arrow") && selRef.current.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0;
        const dy = k === "arrowup" ? -step : k === "arrowdown" ? step : 0;
        const ids = new Set(selRef.current);
        commit(mapEls(boardRef.current, (l) => l.map((x) => (ids.has(x.id) && !x.lock ? moveEl(x, dx, dy) : x))));
        return;
      }
      if (mod) return;
      if (k === " ") {
        spaceDown.current = true;
        e.preventDefault();
        return;
      }
      const map: Record<string, Tool> = { v: "select", l: "line", a: "line", s: "shape", t: "text", p: "pen", h: "hand" };
      if (map[k]) setTool(map[k]);
      if (k === "+" || k === "=") zoomBy(1.25);
      if (k === "-") zoomBy(0.8);
      if (k === "0") setViewOv(null);
    };
  });
  useEffect(() => {
    const down = (e: KeyboardEvent) => keyRef.current(e);
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") spaceDown.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const { overflow, overscrollBehavior } = document.body.style;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    // iOS Safari: stop the whole page from pinch-zooming while working on the board
    const stopGesture = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stopGesture);
    document.addEventListener("gesturechange", stopGesture);
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.overscrollBehavior = overscrollBehavior;
      document.removeEventListener("gesturestart", stopGesture);
      document.removeEventListener("gesturechange", stopGesture);
      cancelAnimationFrame(playRef.current);
    };
  }, []);

  /* ---------------- frames & playback ---------------- */
  function addFrame() {
    const b = boardRef.current;
    const i = frameIdx(b);
    const nf = continueFrame(b.frames[i]);
    const frames = [...b.frames.slice(0, i + 1), nf, ...b.frames.slice(i + 1)];
    commit({ ...b, frames });
    setFrame(i + 1);
    flash(`المرحلة ${i + 2} — حرّك اللاعبين وارسم الأسهم الجديدة`);
  }
  function duplicateFrame() {
    const b = boardRef.current;
    const i = frameIdx(b);
    const nf = { id: uid(), els: b.frames[i].els.slice() };
    commit({ ...b, frames: [...b.frames.slice(0, i + 1), nf, ...b.frames.slice(i + 1)] });
    setFrame(i + 1);
  }
  function deleteFrame() {
    const b = boardRef.current;
    if (b.frames.length < 2) return;
    const i = frameIdx(b);
    commit({ ...b, frames: b.frames.filter((_, j) => j !== i) });
    setFrame(Math.max(0, i - 1));
  }
  function stopPlay() {
    cancelAnimationFrame(playRef.current);
    playRef.current = 0;
    setPlayEls(null);
  }
  function play() {
    const frames = boardRef.current.frames;
    if (frames.length < 2) return;
    setSelection([]);
    setEditing(null);
    let i = 0;
    let t0 = performance.now();
    const hold = 450, dur = 1150;
    fiRef.current = 0;
    setFi(0);
    const step = (now: number) => {
      const el = now - t0;
      if (i >= frames.length - 1) {
        if (el > hold * 2) {
          stopPlay();
          return;
        }
        setPlayEls(frames[frames.length - 1].els);
      } else if (el < hold) setPlayEls(frames[i].els);
      else {
        const t = Math.min(1, (el - hold) / dur);
        setPlayEls(tween(frames[i], frames[i + 1], t));
        if (t >= 1) {
          i++;
          fiRef.current = i;
          setFi(i);
          t0 = now;
        }
      }
      playRef.current = requestAnimationFrame(step);
    };
    playRef.current = requestAnimationFrame(step);
  }

  /* ---------------- export ---------------- */
  async function exportImage() {
    if (!svgRef.current || exporting) return;
    stopPlay();
    setSelection([]);
    setExporting(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const b = boardRef.current;
      const { W: bw, H: bh } = boardSize(b.pitch);
      const frames = b.frames.length;
      const blob = await exportBoardPng(svgRef.current, bw, bh, {
        title: exportTitle,
        subtitle: exportSubtitle,
        frameLabel: frames > 1 ? `المرحلة ${frameIdx(b) + 1} من ${frames}` : undefined,
      });
      if (!blob) throw new Error("export");
      const name = `${(exportTitle || "STRIKE").replace(/[\\/:*?"<>|]+/g, " ").trim() || "STRIKE"}${frames > 1 ? ` - ${frameIdx(b) + 1}` : ""}.png`;
      if (canShareFiles()) {
        // phones: show the image first, then share from a fresh tap (share sheets need a user gesture)
        setExported({ blob, name, url: URL.createObjectURL(blob) });
      } else {
        downloadBlob(blob, name);
        flash("تم حفظ الصورة");
      }
    } catch {
      flash("تعذّر تصدير الصورة");
    } finally {
      setExporting(false);
    }
  }

  useImperativeHandle(ref, () => ({ getBoard: () => boardRef.current, exportImage }));

  /* ---------------- render ---------------- */
  const single = selEls.length === 1 && !playEls ? selEls[0] : null;
  const showProps = !readOnly && selEls.length > 0 && !playEls;
  const vb = `${view.x} ${view.y} ${size.w / view.k || 1} ${size.h / view.k || 1}`;
  const cursor = readOnly ? "cursor-grab" : tool === "select" ? "studio-select" : tool === "hand" ? "cursor-grab" : tool === "text" ? "cursor-text" : "cursor-crosshair";
  const editingEl = editing ? els.find((e) => e.id === editing) : undefined;

  const toolsList: { t: Tool; icon: ReactNode; label: string; key: string }[] = [
    { t: "select", icon: <MousePointer2 size={20} />, label: "تحديد وتحريك", key: "V" },
    { t: "line", icon: <MoveUpRight size={20} />, label: "خطوط وأسهم", key: "L" },
    { t: "shape", icon: <Square size={19} />, label: "أشكال ومناطق", key: "S" },
    { t: "text", icon: <Type size={20} />, label: "نص", key: "T" },
    { t: "pen", icon: <PenLine size={19} />, label: "رسم حر", key: "P" },
    { t: "hand", icon: <Hand size={19} />, label: "تحريك اللوحة", key: "H" },
  ];

  const boardArea = (
    <div ref={setWrapEl} className="relative flex-1 min-w-0 min-h-0 overflow-hidden studio-canvas" onContextMenu={(e) => e.preventDefault()}>
      {size.w > 0 && (
        <svg
          ref={attachSvg}
          className={clsx("absolute inset-0 w-full h-full touch-none select-none", cursor)}
          viewBox={vb}
          preserveAspectRatio="none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => onPointerUp(e)}
          onPointerCancel={(e) => onPointerUp(e, true)}
          onDoubleClick={(e) => {
            const id = (e.target as Element).closest("[data-id]")?.getAttribute("data-id");
            const el = findEl(id ?? null);
            if (!readOnly && el && (el.t === "text" || el.t === "token")) {
              setSelection([el.id]);
              setEditing(el.id);
            }
          }}
        >
          <defs>
            <filter id="board-shadow" x="-5%" y="-5%" width="110%" height="110%">
              <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#000" floodOpacity="0.45" />
            </filter>
          </defs>
          <rect data-ui="" x={0} y={0} width={W} height={H} rx={6} fill="#000" filter="url(#board-shadow)" />
          <PitchLayer pitch={board.pitch} />
          {shownEls.map((el) => (
            <ElementView key={el.id} el={el} u={board.u} hit={readOnly || playEls ? undefined : hitW} danger={dangerSet.has(el.id)} />
          ))}
          {!playEls && !readOnly && <SelectionOverlay sel={selEls} single={single} u={board.u} k={view.k} coarse={coarse} />}
          {ov.guides && (
            <g data-ui="" pointerEvents="none">
              {ov.guides.x !== undefined && <line x1={ov.guides.x} x2={ov.guides.x} y1={-H} y2={H * 2} stroke="#4DA8FF" strokeWidth={1.2 / view.k} strokeDasharray={`${4 / view.k} ${4 / view.k}`} />}
              {ov.guides.y !== undefined && <line y1={ov.guides.y} y2={ov.guides.y} x1={-W} x2={W * 2} stroke="#4DA8FF" strokeWidth={1.2 / view.k} strokeDasharray={`${4 / view.k} ${4 / view.k}`} />}
            </g>
          )}
          {ov.marquee && (
            <rect
              data-ui=""
              pointerEvents="none"
              x={ov.marquee.x0}
              y={ov.marquee.y0}
              width={ov.marquee.x1 - ov.marquee.x0}
              height={ov.marquee.y1 - ov.marquee.y0}
              fill="#4DA8FF"
              fillOpacity={0.12}
              stroke="#4DA8FF"
              strokeWidth={1.4 / view.k}
              strokeDasharray={`${5 / view.k} ${4 / view.k}`}
            />
          )}
        </svg>
      )}

      {/* trash drop-zone while dragging */}
      <div
        ref={trashRef}
        aria-hidden={!ov.trash}
        className={clsx(
          "absolute left-1/2 -translate-x-1/2 bottom-3 z-10 flex items-center gap-2 rounded-full px-4 h-11 text-[13px] font-bold transition-all duration-150 pointer-events-none",
          ov.trash ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
          ov.trash === "hot" ? "bg-error text-white scale-110 shadow-[0_8px_30px_-6px_rgba(214,69,69,0.7)]" : "bg-navy-900/90 text-silver border border-white/10",
        )}
      >
        <Trash2 size={17} /> {ov.trash === "hot" ? "أفلت للحذف" : "اسحب خارج الملعب للحذف"}
      </div>

      {/* zoom */}
      {size.w > 0 && (
        <div className={clsx("absolute z-10 flex items-center gap-0.5 rounded-xl bg-navy-900/85 backdrop-blur border border-white/10 p-0.5", wide ? "bottom-3 left-3" : "top-2 left-2")}>
          <ToolButton title="تصغير" onClick={() => zoomBy(0.8)} className="h-8 w-8">
            <Minus size={16} />
          </ToolButton>
          <button type="button" onClick={() => setViewOv(null)} className="num text-[12px] text-silver hover:text-white w-11 h-8" title="ملاءمة الشاشة">
            {Math.round((view.k / fit.k) * 100)}%
          </button>
          <ToolButton title="تكبير" onClick={() => zoomBy(1.25)} className="h-8 w-8">
            <Plus size={16} />
          </ToolButton>
          {wide && (
            <ToolButton title="ملاءمة الشاشة (0)" onClick={() => setViewOv(null)} className="h-8 w-8">
              <Maximize size={15} />
            </ToolButton>
          )}
        </div>
      )}

      {/* frames (phones: compact, floating) */}
      {!wide && (board.frames.length > 1 || !readOnly) && (
        <div className="absolute top-2 right-2 z-10">
          <FramesBar compact count={board.frames.length} index={fIndex} playing={!!playEls} readOnly={readOnly} onGo={setFrame} onAdd={addFrame} onDuplicate={duplicateFrame} onDelete={deleteFrame} onPlay={play} onStop={stopPlay} />
        </div>
      )}

      {editingEl && (editingEl.t === "text" || editingEl.t === "token") && (
        <InlineEditor
          key={editingEl.id}
          el={editingEl}
          view={view}
          u={board.u}
          onDone={(val) => {
            setEditing(null);
            lastTap.current = null;
            if (val === null) return;
            const b = boardRef.current;
            if (editingEl.t === "text" && !val.trim()) {
              commit(mapEls(b, (l) => l.filter((x) => x.id !== editingEl.id)));
              setSelection([]);
              return;
            }
            if (val === editingEl.text) return;
            commit(mapEls(b, (l) => l.map((x) => (x.id === editingEl.id && (x.t === "text" || x.t === "token") ? { ...x, text: val } : x))));
          }}
        />
      )}

      {toast && <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 rounded-full bg-navy-900/95 border border-white/10 text-white text-[12.5px] font-bold px-4 py-2 fade-up whitespace-nowrap">{toast}</div>}
      {multi && !wide && <div className="absolute bottom-3 right-3 z-10 rounded-full bg-gold text-navy-900 text-[12px] font-bold px-3 py-1.5">تحديد متعدد</div>}
    </div>
  );

  const selectionPanel = showProps ? (
    <>
      <div className="px-3.5 pt-3 pb-1 flex items-center justify-between">
        <div className="font-extrabold text-[14px]">{selectionTitle(selEls)}</div>
        {wide ? (
          <button type="button" onClick={() => setSelection([])} className="text-silver hover:text-white h-8 w-8 grid place-items-center rounded-lg" aria-label="إلغاء التحديد">
            <X size={16} />
          </button>
        ) : (
          <span className="h-8" />
        )}
      </div>
      <PropsPanel sel={selEls} api={api} />
    </>
  ) : null;

  const pitchPanel = (
    <PitchPanel
      pitch={board.pitch}
      u={board.u}
      snap={snapOn}
      onPitch={changePitch}
      onUnit={(v) => changeUnit(v, liveRef.current.active)}
      onUnitStart={api.begin}
      onUnitEnd={api.end}
      onSnap={setSnapOn}
    />
  );

  const toolPanel =
    tool === "line" || tool === "pen" ? (
      <>
        <PanelHead>{tool === "pen" ? "رسم حر" : "الخطوط والأسهم"}</PanelHead>
        <LineOptions style={lineStyle} onChange={changeLineStyle} />
        <Hint>{tool === "pen" ? "ارسم بحرية بإصبعك أو الماوس." : "اسحب على الملعب لرسم خط. ابدأ من اللاعب ليلتصق به. Shift للزوايا الثابتة."}</Hint>
      </>
    ) : tool === "shape" ? (
      <>
        <PanelHead>الأشكال والمناطق</PanelHead>
        <ShapeOptions kind={shapeKind} style={shapeStyle} onKind={changeShapeKind} onChange={changeShapeStyle} />
        <Hint>اسحب لرسم الشكل، أو اضغط مرة لإضافة شكل جاهز. Shift لمربع/دائرة متساوية.</Hint>
      </>
    ) : (
      <>
        <PanelHead>اللاعبون</PanelHead>
        <div className="px-3.5 pb-3">
          <PlayersGrid onItemDown={onItemDown} />
        </div>
        <PanelHead>الأدوات</PanelHead>
        <div className="px-3.5 pb-3">
          <EquipmentGrid onItemDown={onItemDown} />
        </div>
        <Hint>اسحب العنصر إلى الملعب أو اضغطه لإضافته في الوسط. لحذفه اسحبه خارج الملعب.</Hint>
      </>
    );

  /* ---------- desktop / landscape tablet ---------- */
  if (wide) {
    return (
      <div className="studio fixed inset-0 z-40 flex flex-col bg-[#0b1429] text-white">
        <header className="h-14 shrink-0 bg-navy border-b border-white/[0.07] flex items-center gap-3 px-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">{title}</div>
          {(!readOnly || board.frames.length > 1) && (
            <FramesBar count={board.frames.length} index={fIndex} playing={!!playEls} readOnly={readOnly} onGo={setFrame} onAdd={addFrame} onDuplicate={duplicateFrame} onDelete={deleteFrame} onPlay={play} onStop={stopPlay} />
          )}
          <div className="flex items-center gap-1.5 flex-1 justify-end">
            {!readOnly && (
              <>
                <ToolButton title="تراجع (Ctrl+Z)" onClick={undo} disabled={!hs.u} className="h-10 w-10">
                  <Undo2 size={19} />
                </ToolButton>
                <ToolButton title="إعادة (Ctrl+Shift+Z)" onClick={redo} disabled={!hs.r} className="h-10 w-10">
                  <Redo2 size={19} />
                </ToolButton>
                <span className="w-px h-6 bg-white/10 mx-1" />
              </>
            )}
            <button type="button" onClick={exportImage} disabled={exporting} className="h-10 px-3 rounded-xl inline-flex items-center gap-2 text-[13px] font-bold text-silver hover:text-white hover:bg-white/[0.08] disabled:opacity-50">
              <ImageDown size={18} /> {exporting ? "جارٍ التصدير…" : "صورة"}
            </button>
            {actions}
          </div>
        </header>
        {banner}
        <div className="flex-1 min-h-0 flex">
          {!readOnly && (
            <>
              <nav className="w-[60px] shrink-0 bg-navy border-l border-white/[0.07] flex flex-col items-center gap-1 py-3" aria-label="الأدوات">
                {toolsList.map((x) => (
                  <ToolButton
                    key={x.t}
                    active={tool === x.t && !(pitchOpen && !roomy && !showProps)}
                    title={`${x.label} (${x.key})`}
                    onClick={() => {
                      setTool(x.t);
                      setPitchOpen(false);
                    }}
                  >
                    {x.icon}
                  </ToolButton>
                ))}
                <span className="h-px w-8 bg-white/10 my-1.5" />
                <ToolButton active={multi} title="تحديد متعدد باللمس" onClick={() => setMulti(!multi)}>
                  <SquareDashedMousePointer size={19} />
                </ToolButton>
                {!roomy && (
                  <ToolButton
                    active={pitchOpen && !showProps}
                    title="إعدادات اللوحة (نوع الملعب والألوان)"
                    onClick={() => {
                      if (showProps) {
                        setSelection([]);
                        setPitchOpen(true);
                      } else setPitchOpen(!pitchOpen);
                    }}
                  >
                    <Settings2 size={19} />
                  </ToolButton>
                )}
              </nav>
              <aside className={clsx("shrink-0 bg-navy/60 border-l border-white/[0.07] overflow-y-auto studio-scroll", roomy ? "w-[244px]" : "w-[272px]")}>
                {roomy ? (
                  toolPanel
                ) : showProps ? (
                  selectionPanel
                ) : pitchOpen ? (
                  <>
                    <div className="flex items-center justify-between pe-2">
                      <PanelHead>إعدادات اللوحة</PanelHead>
                      <button type="button" onClick={() => setPitchOpen(false)} className="mt-2 text-silver hover:text-white h-8 w-8 grid place-items-center rounded-lg" aria-label="إغلاق إعدادات اللوحة">
                        <X size={16} />
                      </button>
                    </div>
                    {pitchPanel}
                  </>
                ) : (
                  toolPanel
                )}
              </aside>
            </>
          )}
          {boardArea}
          {(roomy || readOnly) && (
            <aside className="w-[284px] shrink-0 bg-navy border-r border-white/[0.07] overflow-y-auto studio-scroll">
              {readOnly ? info : showProps ? selectionPanel : (
                <>
                  <PanelHead>إعدادات اللوحة</PanelHead>
                  {pitchPanel}
                </>
              )}
            </aside>
          )}
        </div>
        {ghost && <GhostView ghost={ghost} size={ghostSize(ghost.item)} />}
        {exported && (
          <ExportSheet
            exported={exported}
            title={exportTitle}
            onClose={() => {
              URL.revokeObjectURL(exported.url);
              setExported(null);
            }}
          />
        )}
      </div>
    );
  }

  /* ---------- phones & portrait tablets ---------- */
  const dock: { id: Sheet | Tool; icon: ReactNode; label: string }[] = readOnly
    ? []
    : [
        { id: "select", icon: <MousePointer2 size={21} />, label: "تحديد" },
        { id: "players", icon: <Users size={21} />, label: "لاعبون" },
        { id: "equipment", icon: <Dumbbell size={21} />, label: "أدوات" },
        { id: "line", icon: <MoveUpRight size={21} />, label: "أسهم" },
        { id: "shape", icon: <Shapes size={21} />, label: "أشكال" },
        { id: "more", icon: <Ellipsis size={21} />, label: "المزيد" },
      ];
  const activeDock = sheet === "players" || sheet === "equipment" || sheet === "more" || sheet === "board" ? sheet : tool === "line" || tool === "pen" ? "line" : tool === "shape" ? "shape" : tool === "text" ? "more" : tool === "select" ? "select" : null;

  function onDock(id: Sheet | Tool) {
    if (id === "select") {
      setTool("select");
      setSheet(null);
    } else if (id === "line") {
      setTool(tool === "line" ? "select" : "line");
      setSheet(null);
    } else if (id === "shape") {
      setTool(tool === "shape" ? "select" : "shape");
      setSheet(null);
    } else setSheet(sheet === id ? null : (id as Sheet));
  }

  let sheetBody: ReactNode = null;
  if (readOnly) {
    sheetBody = sheet === "info" ? info : null;
  } else if (sheet === "players") sheetBody = <div className="px-3 py-3 overflow-x-auto no-scrollbar"><PlayersGrid row onItemDown={onItemDown} /></div>;
  else if (sheet === "equipment") sheetBody = <div className="px-3 py-3 overflow-x-auto no-scrollbar"><EquipmentGrid row onItemDown={onItemDown} /></div>;
  else if (sheet === "board") sheetBody = pitchPanel;
  else if (sheet === "props") sheetBody = selectionPanel;
  else if (sheet === "more")
    sheetBody = (
      <>
        <div className="px-3.5 pt-3.5 text-[11.5px] font-bold text-silver/80">المزيد</div>
        <div className="p-3 grid grid-cols-4 gap-2">
          <MoreBtn icon={<Type size={20} />} label="نص" active={tool === "text"} onClick={() => { setTool("text"); setSheet(null); flash("اضغط على الملعب لإضافة نص"); }} />
          <MoreBtn icon={<PenLine size={20} />} label="رسم حر" active={tool === "pen"} onClick={() => { setTool("pen"); setSheet(null); }} />
          <MoreBtn icon={<SquareDashedMousePointer size={20} />} label="تحديد متعدد" active={multi} onClick={() => { setTool("select"); setMulti(!multi); setSheet(null); }} />
          <MoreBtn icon={<Settings2 size={20} />} label="الملعب" onClick={() => setSheet("board")} />
          <MoreBtn icon={<Layers size={20} />} label="مرحلة جديدة" onClick={() => { addFrame(); setSheet(null); }} />
          <MoreBtn icon={<CopyPlus size={20} />} label="نسخ المرحلة" onClick={() => { duplicateFrame(); setSheet(null); }} />
          <MoreBtn icon={<ImageDown size={20} />} label="صورة" onClick={() => { setSheet(null); exportImage(); }} />
          <MoreBtn icon={<Hand size={20} />} label="تحريك اللوحة" active={tool === "hand"} onClick={() => { setTool(tool === "hand" ? "select" : "hand"); setSheet(null); }} />
        </div>
      </>
    );

  const toolStrip =
    !readOnly && !sheet && (tool === "line" || tool === "pen") ? (
      <LineStrip style={lineStyle} onChange={changeLineStyle} />
    ) : !readOnly && !sheet && tool === "shape" ? (
      <ShapeStrip kind={shapeKind} style={shapeStyle} onKind={changeShapeKind} onChange={changeShapeStyle} />
    ) : null;

  const quickBar =
    showProps && !sheet && tool === "select" ? (
      <div className="px-3 pt-2.5 pb-2 border-t border-white/[0.07]">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-extrabold text-[13px] truncate">{selectionTitle(selEls)}</span>
          <span className="flex-1" />
          <button type="button" onClick={() => setSheet("props")} className="h-8 px-3 rounded-lg bg-white/[0.08] text-[12px] font-bold inline-flex items-center gap-1">
            <Settings2 size={14} /> خيارات
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
            <QuickColors value={mainColor(selEls[0])} onPick={(c) => patchSel((e) => withMainColor(e, c))} />
          </div>
          <ToolButton title="تكرار" onClick={duplicate} className="h-9 w-9 bg-white/[0.07]">
            <CopyPlus size={17} />
          </ToolButton>
          <ToolButton title="حذف" onClick={removeSel} className="h-9 w-9 bg-error/20 text-[#ff8a8a]">
            <Trash2 size={17} />
          </ToolButton>
        </div>
      </div>
    ) : null;

  return (
    <div className="studio fixed inset-0 z-40 flex flex-col bg-[#0b1429] text-white" style={{ height: "100dvh" }}>
      <header className="shrink-0 bg-navy border-b border-white/[0.07] pt-[env(safe-area-inset-top)]">
        <div className="h-[52px] flex items-center gap-1.5 px-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">{title}</div>
          {!readOnly && (
            <>
              <ToolButton title="تراجع" onClick={undo} disabled={!hs.u} className="h-10 w-10">
                <Undo2 size={19} />
              </ToolButton>
              <ToolButton title="إعادة" onClick={redo} disabled={!hs.r} className="h-10 w-10">
                <Redo2 size={19} />
              </ToolButton>
            </>
          )}
          {readOnly && (
            <ToolButton title="صورة" onClick={exportImage} className="h-10 w-10">
              <ImageDown size={19} />
            </ToolButton>
          )}
          {actions}
        </div>
      </header>
      {banner}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {boardArea}
        {(sheetBody || toolStrip || (quickBar && !ov.trash)) && (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-navy/95 backdrop-blur-md border-t border-white/[0.08] rounded-t-2xl shadow-[0_-12px_30px_-12px_rgba(0,0,0,0.5)] fade-up">
            {sheetBody && (
              <div className="relative max-h-[46dvh] overflow-y-auto studio-scroll">
                <button type="button" onClick={() => setSheet(null)} className="absolute top-2 left-2 z-10 h-8 w-8 grid place-items-center rounded-lg text-silver bg-white/[0.06]" aria-label="إغلاق">
                  <X size={16} />
                </button>
                {sheet === "players" || sheet === "equipment" ? <div className="text-[11.5px] font-bold text-silver/80 px-3.5 pt-3">اسحب للأعلى إلى الملعب أو اضغط للإضافة</div> : null}
                {sheetBody}
              </div>
            )}
            {!sheetBody && toolStrip}
            {!sheetBody && !toolStrip && !ov.trash && quickBar}
          </div>
        )}
      </div>
      <div className="shrink-0 bg-navy border-t border-white/[0.07] pb-[env(safe-area-inset-bottom)]">
        {readOnly ? (
          <div className="h-[60px] flex items-center gap-2 px-3">
            {board.frames.length > 1 && (
              <button type="button" onClick={playEls ? stopPlay : play} className="h-11 px-4 rounded-xl bg-ice text-navy-900 font-bold text-[14px] inline-flex items-center gap-2">
                {playEls ? <Square size={16} /> : <Play size={16} />} {playEls ? "إيقاف" : "تشغيل المراحل"}
              </button>
            )}
            <button type="button" onClick={() => setSheet(sheet === "info" ? null : "info")} className="h-11 px-4 rounded-xl bg-white/[0.08] font-bold text-[14px] flex-1">
              {sheet === "info" ? "إخفاء التفاصيل" : "تفاصيل التمرين"}
            </button>
          </div>
        ) : (
          <nav className="h-[60px] flex items-stretch px-1" aria-label="الأدوات">
            {dock.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onDock(d.id)}
                className={clsx("flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] font-bold transition-colors", activeDock === d.id ? "text-ice" : "text-silver")}
              >
                <span className={clsx("h-8 w-12 grid place-items-center rounded-full transition-colors", activeDock === d.id && "bg-ice/15")}>{d.icon}</span>
                {d.label}
              </button>
            ))}
          </nav>
        )}
      </div>
      {ghost && <GhostView ghost={ghost} size={ghostSize(ghost.item)} />}
      {exported && (
        <ExportSheet
          exported={exported}
          title={exportTitle}
          onClose={() => {
            URL.revokeObjectURL(exported.url);
            setExported(null);
          }}
        />
      )}
    </div>
  );
}

/* ====================================================================== */

function ExportSheet({ exported, title, onClose }: { exported: { blob: Blob; name: string; url: string }; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] bg-navy-900/80 backdrop-blur-sm flex flex-col items-center justify-end sm:justify-center p-3 pb-[max(env(safe-area-inset-bottom),12px)]" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-navy border border-white/10 p-3 fade-up" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={exported.url} alt="صورة التمرين" className="w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button type="button" onClick={() => shareFile(exported.blob, exported.name, title)} className="h-12 rounded-xl bg-ice text-navy-900 font-bold text-[15px]">
            مشاركة
          </button>
          <button type="button" onClick={() => downloadBlob(exported.blob, exported.name)} className="h-12 rounded-xl bg-white/[0.08] text-white font-bold text-[15px]">
            حفظ الصورة
          </button>
        </div>
        <button type="button" onClick={onClose} className="w-full h-11 mt-2 rounded-xl text-silver font-bold text-[14px]">
          إغلاق
        </button>
      </div>
    </div>
  );
}

function PanelHead({ children }: { children: ReactNode }) {
  return <div className="px-3.5 pt-3.5 pb-1 text-[13px] font-extrabold text-white">{children}</div>;
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="px-3.5 pb-4 pt-1 text-[11.5px] leading-relaxed text-silver/70">{children}</p>;
}

function MoreBtn({ icon, label, onClick, active }: { icon: ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={clsx("rounded-xl py-2.5 flex flex-col items-center gap-1 text-[11px] font-bold", active ? "bg-ice text-navy-900" : "bg-white/[0.06] text-silver")}>
      {icon}
      {label}
    </button>
  );
}

function QuickColors({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  const list = ["#1C2D5A", "#4DA8FF", "#E7B53C", "#FFFFFF", "#141414", "#E84C3D", "#F2994A", "#FFE14D", "#7CCF84", "#9B6BDF"];
  return (
    <div className="flex gap-1.5">
      {list.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          aria-label={c}
          className={clsx("h-8 w-8 shrink-0 rounded-full border border-white/25", value.toLowerCase() === c.toLowerCase() && "ring-2 ring-ice ring-offset-2 ring-offset-navy")}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function FramesBar({
  count,
  index,
  playing,
  readOnly,
  compact,
  onGo,
  onAdd,
  onDuplicate,
  onDelete,
  onPlay,
  onStop,
}: {
  count: number;
  index: number;
  playing: boolean;
  readOnly: boolean;
  compact?: boolean;
  onGo: (i: number) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPlay: () => void;
  onStop: () => void;
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-0.5 rounded-xl bg-navy-900/85 backdrop-blur border border-white/10 p-0.5">
        {count > 1 && (
          <ToolButton title="المرحلة السابقة" onClick={() => onGo(Math.max(0, index - 1))} disabled={index === 0 || playing} className="h-8 w-8">
            <ChevronRight size={16} />
          </ToolButton>
        )}
        <span className="text-[12px] font-bold text-silver px-1.5">
          مرحلة <span className="num text-white">{index + 1}</span>
          {count > 1 && <span className="num">/{count}</span>}
        </span>
        {count > 1 && (
          <ToolButton title="المرحلة التالية" onClick={() => onGo(Math.min(count - 1, index + 1))} disabled={index === count - 1 || playing} className="h-8 w-8">
            <ChevronLeft size={16} />
          </ToolButton>
        )}
        {count > 1 && (
          <ToolButton title={playing ? "إيقاف" : "تشغيل"} onClick={playing ? onStop : onPlay} active={playing} className="h-8 w-8">
            {playing ? <Square size={14} /> : <Play size={15} />}
          </ToolButton>
        )}
        {!readOnly && count > 1 && !playing && (
          <ToolButton title="حذف المرحلة" onClick={onDelete} className="h-8 w-8">
            <Trash2 size={14} />
          </ToolButton>
        )}
        {!readOnly && !playing && (
          <ToolButton title="مرحلة جديدة" onClick={onAdd} className="h-8 w-8">
            <Plus size={16} />
          </ToolButton>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 rounded-xl bg-white/[0.05] border border-white/[0.07] p-1">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onGo(i)}
          disabled={playing}
          className={clsx("h-8 min-w-8 px-2 rounded-lg text-[12.5px] font-bold num", i === index ? "bg-ice text-navy-900" : "text-silver hover:text-white hover:bg-white/[0.08]")}
          title={`المرحلة ${i + 1}`}
        >
          {i + 1}
        </button>
      ))}
      {!readOnly && (
        <>
          <ToolButton title="مرحلة جديدة (تكمل من الحالية)" onClick={onAdd} className="h-8 w-8" disabled={playing}>
            <Plus size={16} />
          </ToolButton>
          <ToolButton title="نسخ المرحلة كما هي" onClick={onDuplicate} className="h-8 w-8" disabled={playing}>
            <CopyPlus size={15} />
          </ToolButton>
          {count > 1 && (
            <ToolButton title="حذف المرحلة الحالية" onClick={onDelete} className="h-8 w-8" disabled={playing}>
              <Trash2 size={15} />
            </ToolButton>
          )}
        </>
      )}
      {count > 1 && (
        <button type="button" onClick={playing ? onStop : onPlay} className={clsx("h-8 px-3 rounded-lg text-[12.5px] font-bold inline-flex items-center gap-1.5", playing ? "bg-gold text-navy-900" : "bg-white/[0.08] text-white hover:bg-white/[0.14]")}>
          {playing ? <Square size={13} /> : <Play size={14} />} {playing ? "إيقاف" : "تشغيل"}
        </button>
      )}
      {count === 1 && !readOnly && <span className="text-[11.5px] text-silver/70 px-1.5 hidden xl:inline">مراحل التمرين</span>}
    </div>
  );
}

function GhostView({ ghost, size }: { ghost: Ghost; size: number }) {
  const t = ghost.item.kind === "token" ? TEAMS.find((x) => x.v === (ghost.item as { team: string }).team) : null;
  return (
    <div className="fixed z-[60] pointer-events-none" style={{ left: ghost.x, top: ghost.y, transform: "translate(-50%, -50%)" }}>
      <div className={clsx("transition-opacity", ghost.over ? "opacity-100" : "opacity-60")} style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.45))" }}>
        {ghost.item.kind === "token" && t ? <TokenPreview fill={t.fill} stroke={t.stroke} text="" size={size} /> : ghost.item.kind === "art" ? <ArtPreview art={ghost.item.key} size={size * 1.12} /> : null}
      </div>
      {!ghost.over && <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap rounded-full bg-navy-900/90 text-silver text-[11px] font-bold px-2 py-0.5">أفلت داخل الملعب</div>}
    </div>
  );
}

function SelectionOverlay({ sel, single, u, k, coarse }: { sel: El[]; single: El | null; u: number; k: number; coarse: boolean }) {
  if (!sel.length) return null;
  const px = (n: number) => n / k;
  const hr = px(coarse ? 14 : 10);
  const stroke = "#4DA8FF";
  const handle = (id: string, kind: string, x: number, y: number, shape: "circle" | "diamond" | "rot" = "circle") => (
    <g key={kind} data-handle={`${id}:${kind}`} className={kind === "rot" ? "cursor-grab" : kind === "mid" ? "cursor-move" : "cursor-nwse-resize"}>
      <circle cx={x} cy={y} r={hr} fill="#000" fillOpacity={0} />
      {shape === "diamond" ? (
        <rect x={x - px(5.5)} y={y - px(5.5)} width={px(11)} height={px(11)} transform={`rotate(45 ${x} ${y})`} fill={stroke} stroke="#fff" strokeWidth={px(2)} pointerEvents="none" />
      ) : (
        <circle cx={x} cy={y} r={px(shape === "rot" ? 7 : 6.5)} fill={shape === "rot" ? stroke : "#fff"} stroke={shape === "rot" ? "#fff" : stroke} strokeWidth={px(2)} pointerEvents="none" />
      )}
    </g>
  );
  return (
    <g data-ui="">
      {sel.map((el) => (
        <Outline key={el.id} el={el} u={u} k={k} />
      ))}
      {sel.length > 1 && (() => {
        const b = unionBox(sel.map((e) => elBounds(e, u)));
        if (!b) return null;
        const p = px(8);
        return <rect x={b.x0 - p} y={b.y0 - p} width={b.x1 - b.x0 + p * 2} height={b.y1 - b.y0 + p * 2} fill="none" stroke={stroke} strokeWidth={px(1.2)} strokeDasharray={`${px(6)} ${px(4)}`} pointerEvents="none" rx={px(6)} />;
      })()}
      {single && !single.lock && (() => {
        const el = single;
        if (el.t === "line") {
          const m = el.c ?? { x: (el.a.x + el.b.x) / 2, y: (el.a.y + el.b.y) / 2 };
          return (
            <>
              {handle(el.id, "a", el.a.x, el.a.y)}
              {handle(el.id, "b", el.b.x, el.b.y)}
              {handle(el.id, "mid", m.x, m.y, "diamond")}
            </>
          );
        }
        if (el.t === "token") {
          const R = tokenRadius(el, u) + px(9);
          return handle(el.id, "scale", el.x + R * 0.71, el.y + R * 0.71);
        }
        if (el.t === "art" || el.t === "text" || el.t === "shape") {
          const { w, h } = el.t === "art" ? artDims(el, u) : el.t === "text" ? pad(textDims(el), el.size) : { w: el.w, h: el.h };
          const c = { x: el.x, y: el.y };
          const pd = el.t === "shape" ? 0 : px(6);
          const top = rotateP({ x: el.x, y: el.y - h / 2 - pd - px(24) }, el.r, c);
          const topEdge = rotateP({ x: el.x, y: el.y - h / 2 - pd }, el.r, c);
          return (
            <>
              <line x1={topEdge.x} y1={topEdge.y} x2={top.x} y2={top.y} stroke={stroke} strokeWidth={px(1.5)} pointerEvents="none" />
              {handle(el.id, "rot", top.x, top.y, "rot")}
              {el.t === "shape"
                ? [0, 1, 2, 3].map((i) => {
                    const sx = i === 0 || i === 3 ? -1 : 1, sy = i < 2 ? -1 : 1;
                    const pt = rotateP({ x: el.x + (sx * w) / 2, y: el.y + (sy * h) / 2 }, el.r, c);
                    return handle(el.id, `c${i}`, pt.x, pt.y);
                  })
                : (() => {
                    const pt = rotateP({ x: el.x + w / 2 + pd, y: el.y + h / 2 + pd }, el.r, c);
                    return handle(el.id, "scale", pt.x, pt.y);
                  })()}
            </>
          );
        }
        return null;
      })()}
    </g>
  );
}

/** is p on the "core" of the element (where a press should move it rather than grab a handle)? */
function insideBody(el: El, p: P, u: number) {
  if (el.t === "token") return dist(p, el) < tokenRadius(el, u) * 0.8;
  if (el.t === "art" || el.t === "text" || el.t === "shape") {
    const { w, h } = el.t === "art" ? artDims(el, u) : el.t === "text" ? textDims(el) : { w: el.w, h: el.h };
    const l = rotateP(p, -el.r, { x: el.x, y: el.y });
    return Math.abs(l.x - el.x) < (w / 2) * 0.62 && Math.abs(l.y - el.y) < (h / 2) * 0.62;
  }
  return false;
}

function pad(d: { w: number; h: number }, size: number) {
  return { w: d.w + size * 0.7, h: d.h + size * 0.16 };
}

function Outline({ el, u, k }: { el: El; u: number; k: number }) {
  const px = (n: number) => n / k;
  const stroke = "#4DA8FF";
  const common = { fill: "none", stroke, strokeWidth: px(1.6), pointerEvents: "none" as const };
  if (el.t === "token") return <circle cx={el.x} cy={el.y} r={tokenRadius(el, u) + px(4)} {...common} />;
  if (el.t === "line" || el.t === "pen") {
    const b = elBounds(el, u);
    return (
      <>
        <rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} {...common} strokeOpacity={0.45} strokeDasharray={`${px(4)} ${px(3)}`} rx={px(4)} />
        {el.lock && <LockBadge x={b.x1} y={b.y0} k={k} />}
      </>
    );
  }
  const { w, h } = el.t === "art" ? artDims(el, u) : el.t === "text" ? pad(textDims(el), el.size) : { w: el.w, h: el.h };
  const p = el.t === "shape" ? px(3) : px(5);
  return (
    <g transform={`translate(${el.x} ${el.y}) rotate(${el.r})`}>
      <rect x={-w / 2 - p} y={-h / 2 - p} width={w + p * 2} height={h + p * 2} {...common} rx={px(4)} />
      {el.lock && <LockBadge x={w / 2 + p} y={-h / 2 - p} k={k} />}
    </g>
  );
}

function LockBadge({ x, y, k }: { x: number; y: number; k: number }) {
  const s = 18 / k;
  return (
    <g transform={`translate(${x - s / 2} ${y - s / 2})`} pointerEvents="none">
      <rect width={s} height={s} rx={s / 3} fill="#E7B53C" />
      <path d={`M${s * 0.3} ${s * 0.48}V${s * 0.38}a${s * 0.2} ${s * 0.2} 0 0 1 ${s * 0.4} 0V${s * 0.48}`} fill="none" stroke="#14213f" strokeWidth={s * 0.09} />
      <rect x={s * 0.25} y={s * 0.47} width={s * 0.5} height={s * 0.32} rx={s * 0.06} fill="#14213f" />
    </g>
  );
}

function InlineEditor({ el, view, u, onDone }: { el: El & { t: "text" | "token" }; view: View; u: number; onDone: (v: string | null) => void }) {
  const [val, setVal] = useState(el.text);
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  const x = (el.x - view.x) * view.k;
  const y = (el.y - view.y) * view.k;
  if (el.t === "token") {
    const d = Math.max(44, tokenRadius(el, u) * 2 * view.k + 16);
    return (
      <input
        autoFocus
        value={val}
        maxLength={12}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => finish(val)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(val);
          if (e.key === "Escape") finish(null);
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="absolute z-20 rounded-xl bg-white text-navy-900 text-center font-bold num outline-none ring-4 ring-ice/60 text-[18px]"
        style={{ left: x, top: y, width: Math.max(80, d * 1.6), height: 44, transform: "translate(-50%, -50%)" }}
        aria-label="رقم اللاعب"
      />
    );
  }
  const fs = Math.max(16, el.size * view.k);
  return (
    <textarea
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => finish(val)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          finish(val);
        }
        if (e.key === "Escape") finish(null);
      }}
      onFocus={(e) => e.currentTarget.select()}
      rows={Math.max(1, val.split("\n").length)}
      className="absolute z-20 rounded-xl bg-white/95 text-navy-900 text-center font-bold outline-none ring-4 ring-ice/60 resize-none px-3 py-1 leading-tight"
      style={{ left: x, top: y, fontSize: fs, minWidth: 140, width: Math.max(140, Math.min(360, (val.length + 2) * fs * 0.6)), transform: "translate(-50%, -50%)" }}
      aria-label="النص"
    />
  );
}


