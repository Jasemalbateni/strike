/* Board model helpers: catalog, factories, bounds, transforms, frame interpolation. */
import { ART, type ArtAsset } from "./art";
import { EXTRA_ART } from "./art-extra";
import { contrastText, darken, lighten } from "./colors";
import { angleDelta, boxOf, dist, lerp, lerpP, normAngle, rotatedHalf, sampleLine, type Box } from "./geometry";
import { boardSize, defaultUnit, isLightPitch } from "./pitch";
import type { ArtEl, Board, El, Frame, LineEl, LineStyle, P, Pitch, PitchKind, ShapeEl, ShapeKind, ShapeStyle, Team, TextEl, TokenEl } from "./types";

export const ASSETS: Record<string, ArtAsset> = { ...ART, ...EXTRA_ART };

/* ---------- catalog ---------- */

export type EquipmentItem = { key: string; label: string; size: number };

/** size = longest side in token-diameter units */
export const EQUIPMENT: EquipmentItem[] = [
  { key: "ball", label: "كرة", size: 0.55 },
  { key: "marker", label: "صحن", size: 0.55 },
  { key: "cone3d", label: "قمع", size: 0.8 },
  { key: "cone", label: "قمع طويل", size: 1 },
  { key: "pole", label: "شاخص", size: 1.4 },
  { key: "hurdle", label: "حاجز", size: 1 },
  { key: "ladder", label: "سلّم رشاقة", size: 3 },
  { key: "hoop", label: "حلقة", size: 1.1 },
  { key: "mannequin", label: "دمية", size: 1.45 },
  { key: "flag", label: "علم", size: 1.1 },
  { key: "minigoal", label: "مرمى صغير", size: 1.35 },
  { key: "goal", label: "مرمى كبير", size: 2.44 },
  { key: "coach", label: "مدرب", size: 1 },
];

export const equipment = (key: string) => EQUIPMENT.find((e) => e.key === key);

/** does the art have a meaningful secondary colour? */
export function hasSecondary(key: string) {
  const a = ASSETS[key];
  return !!a && a.paths.some((p) => p.fill === "c2" || p.stroke === "c2");
}

export const TEAMS: { v: Team; label: string; fill: string; stroke: string }[] = [
  { v: "a", label: "فريق أ", fill: "#4DA8FF", stroke: "#14213f" },
  { v: "b", label: "فريق ب", fill: "#E84C3D", stroke: "#141414" },
  { v: "gk", label: "حارس", fill: "#E7B53C", stroke: "#14213f" },
  { v: "n", label: "جوكر", fill: "#FFFFFF", stroke: "#14213f" },
];

export const LINE_PRESETS: { id: string; label: string; hint: string; style: Omit<LineStyle, "color"> }[] = [
  { id: "pass", label: "تمريرة", hint: "خط متصل بسهم", style: { w: 3, dash: "solid", pattern: "plain", heads: "end" } },
  { id: "run", label: "جري", hint: "خط متقطع بسهم", style: { w: 3, dash: "dashed", pattern: "plain", heads: "end" } },
  { id: "dribble", label: "قيادة كرة", hint: "زقزاق بسهم", style: { w: 2.5, dash: "solid", pattern: "zigzag", heads: "end" } },
  { id: "shot", label: "تسديد", hint: "خط سميك بسهم", style: { w: 5.5, dash: "solid", pattern: "plain", heads: "end" } },
  { id: "line", label: "خط", hint: "بدون سهم", style: { w: 3, dash: "solid", pattern: "plain", heads: "none" } },
  { id: "boundary", label: "حدود", hint: "متقطع بدون سهم", style: { w: 2.5, dash: "dashed", pattern: "plain", heads: "none" } },
];

export const SHAPE_PRESETS: { id: string; label: string; style: ShapeStyle }[] = [
  { id: "zone", label: "منطقة", style: { stroke: "#FFFFFF", sw: 2.5, dash: "dashed", fill: "#FFFFFF", fo: 0.14 } },
  { id: "filled", label: "مظلّل", style: { stroke: "#4DA8FF", sw: 2.5, dash: "solid", fill: "#4DA8FF", fo: 0.28 } },
  { id: "outline", label: "إطار", style: { stroke: "#FFFFFF", sw: 3, dash: "solid", fill: null, fo: 0.2 } },
  { id: "gold", label: "تمييز", style: { stroke: "#E7B53C", sw: 3, dash: "solid", fill: "#E7B53C", fo: 0.22 } },
];

/* ---------- ids ---------- */

export function uid() {
  return Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 5);
}

/* ---------- defaults ---------- */

export function newBoard(kind: PitchKind = "half"): Board {
  return {
    v: 1,
    pitch: { kind, vertical: false, style: "grass", stripes: true },
    u: defaultUnit(kind),
    frames: [{ id: uid(), els: [] }],
  };
}

/** defensive parse of a stored board */
export function parseBoard(raw: unknown): Board {
  const b = raw as Partial<Board> | null;
  if (!b || typeof b !== "object" || !Array.isArray(b.frames) || !b.frames.length || !b.pitch) return newBoard();
  return {
    v: 1,
    pitch: { kind: b.pitch.kind ?? "half", vertical: !!b.pitch.vertical, style: b.pitch.style ?? "grass", stripes: b.pitch.stripes ?? true, bg: b.pitch.bg, line: b.pitch.line },
    u: typeof b.u === "number" && b.u > 5 ? b.u : defaultUnit(b.pitch.kind ?? "half"),
    frames: b.frames.map((f) => ({ id: f.id || uid(), els: Array.isArray(f.els) ? (f.els as El[]).filter((e) => e && typeof e === "object" && "t" in e) : [] })),
  };
}

export function defaultInk(p: Pitch) {
  return isLightPitch(p) ? "#1C2D5A" : "#FFFFFF";
}

/* ---------- factories ---------- */

export function nextNumber(els: El[], team: Team) {
  const nums = els.filter((e): e is TokenEl => e.t === "token" && e.team === team).map((e) => parseInt(e.text, 10)).filter((n) => !Number.isNaN(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

export function makeToken(team: Team, p: P, els: El[]): TokenEl {
  const t = TEAMS.find((x) => x.v === team) ?? TEAMS[0];
  const n = team === "gk" ? "GK" : team === "n" ? "J" : String(nextNumber(els, team));
  return { id: uid(), t: "token", x: p.x, y: p.y, s: 1, team, fill: t.fill, stroke: t.stroke, text: n };
}

export function makeArt(key: string, p: P, pitch: Pitch): ArtEl {
  let r = 0;
  if (key === "goal" || key === "minigoal") {
    // the art's net points to +x (goal on the right). Aim it out of the pitch by default.
    const goalAtTop = pitch.kind === "half" || pitch.kind === "box";
    r = goalAtTop ? (pitch.vertical ? 0 : -90) : pitch.vertical ? -90 : 0;
  }
  return { id: uid(), t: "art", x: p.x, y: p.y, r, s: 1, art: key };
}

export function makeLine(style: LineStyle, a: P, b: P): LineEl {
  return { id: uid(), t: "line", a, b, ...style };
}

export function makeShape(shape: ShapeKind, style: ShapeStyle, x: number, y: number, w: number, h: number): ShapeEl {
  return { id: uid(), t: "shape", shape, x, y, w, h, r: 0, ...style };
}

export function makeText(p: P, color: string, u: number): TextEl {
  return { id: uid(), t: "text", x: p.x, y: p.y, r: 0, text: "نص", size: Math.round(u * 0.7), color, bg: null };
}

/* ---------- sizes & bounds ---------- */

export function tokenRadius(el: TokenEl, u: number) {
  return (u * el.s) / 2;
}

export function artDims(el: Pick<ArtEl, "art" | "s">, u: number) {
  const a = ASSETS[el.art];
  const size = (equipment(el.art)?.size ?? 1) * u * el.s;
  if (!a) return { w: size, h: size, k: size / 100 };
  const k = size / 100;
  return { w: a.w * k, h: a.h * k, k };
}

export function textDims(el: Pick<TextEl, "text" | "size">) {
  const lines = el.text.split("\n");
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { w: el.size * (0.56 * longest + 0.2), h: el.size * (1.25 * lines.length) };
}

export function elBounds(el: El, u: number): Box {
  switch (el.t) {
    case "token": {
      const r = tokenRadius(el, u);
      return { x0: el.x - r, y0: el.y - r, x1: el.x + r, y1: el.y + r };
    }
    case "art": {
      const { w, h } = artDims(el, u);
      const { hx, hy } = rotatedHalf(w, h, el.r);
      return { x0: el.x - hx, y0: el.y - hy, x1: el.x + hx, y1: el.y + hy };
    }
    case "shape": {
      const { hx, hy } = rotatedHalf(el.w, el.h, el.r);
      return { x0: el.x - hx, y0: el.y - hy, x1: el.x + hx, y1: el.y + hy };
    }
    case "text": {
      const { w, h } = textDims(el);
      const { hx, hy } = rotatedHalf(w + el.size * 0.5, h, el.r);
      return { x0: el.x - hx, y0: el.y - hy, x1: el.x + hx, y1: el.y + hy };
    }
    case "line": {
      const sm = sampleLine(el.a, el.b, el.c);
      return boxOf(sm.pts, el.w + 4);
    }
    case "pen":
      return boxOf(el.pts.length ? el.pts : [{ x: 0, y: 0 }], el.w + 4);
  }
}

export function elCenter(el: El, u: number): P {
  if (el.t === "line" || el.t === "pen") {
    const b = elBounds(el, u);
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  }
  return { x: el.x, y: el.y };
}

/* ---------- transforms ---------- */

export function moveEl<T extends El>(el: T, dx: number, dy: number): T {
  switch (el.t) {
    case "line":
      return { ...el, a: { x: el.a.x + dx, y: el.a.y + dy }, b: { x: el.b.x + dx, y: el.b.y + dy }, c: el.c ? { x: el.c.x + dx, y: el.c.y + dy } : undefined };
    case "pen":
      return { ...el, pts: el.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    default:
      return { ...el, x: (el as { x: number }).x + dx, y: (el as { y: number }).y + dy };
  }
}

/** rotate every element 90° with the board (cw: landscape → vertical) */
export function rotateBoardEls(els: El[], cw: boolean, before: { W: number; H: number }): El[] {
  const tp = (p: P): P => (cw ? { x: before.H - p.y, y: p.x } : { x: p.y, y: before.W - p.x });
  const dr = cw ? 90 : -90;
  return els.map((el) => {
    switch (el.t) {
      case "line":
        return { ...el, a: tp(el.a), b: tp(el.b), c: el.c ? tp(el.c) : undefined };
      case "pen":
        return { ...el, pts: el.pts.map(tp) };
      case "token": {
        const p = tp(el);
        return { ...el, x: p.x, y: p.y };
      }
      default: {
        const p = tp(el);
        return { ...el, x: p.x, y: p.y, r: normAngle(el.r + dr) } as El;
      }
    }
  });
}

/** copy for paste / duplicate */
export function cloneEl<T extends El>(el: T, dx: number, dy: number): T {
  return { ...moveEl(el, dx, dy), id: uid() };
}

/* ---------- colours ---------- */

/** the "main" colour of an element (what the colour swatch edits) */
export function mainColor(el: El): string {
  switch (el.t) {
    case "token":
      return el.fill;
    case "art":
      return el.c1 ?? ASSETS[el.art]?.defaults.c1 ?? "#ffffff";
    case "line":
    case "pen":
      return el.color;
    case "shape":
      return el.fill ?? el.stroke;
    case "text":
      return el.color;
  }
}

export function withMainColor(el: El, c: string): El {
  switch (el.t) {
    case "token":
      return { ...el, fill: c, tc: undefined };
    case "art":
      return { ...el, c1: c };
    case "line":
    case "pen":
      return { ...el, color: c };
    case "shape":
      return el.fill ? { ...el, fill: c, stroke: el.stroke === el.fill ? c : el.stroke } : { ...el, stroke: c };
    case "text":
      return { ...el, color: c };
  }
}

export function tokenTextColor(el: TokenEl) {
  return el.tc ?? contrastText(el.fill);
}

/** resolve an art colour slot */
export function slotColor(slot: string | null, el: Pick<ArtEl, "art" | "c1" | "c2">): string {
  if (!slot) return "none";
  const a = ASSETS[el.art];
  const c1 = el.c1;
  if (slot === "c1") return c1 ?? a?.defaults.c1 ?? "#ffffff";
  if (slot === "c2") return el.c2 ?? a?.defaults.c2 ?? "#141414";
  if (slot === "k") return "#141414";
  if (slot.startsWith("#")) return slot;
  const [name, orig] = slot.split(":");
  if (!c1) return orig ?? "#ffffff";
  if (name === "c1d") return darken(c1, 0.22);
  if (name === "c1l") return lighten(c1, 0.16);
  if (name === "c1t") return lighten(c1, 0.8);
  return orig ?? c1;
}

/* ---------- frames / animation ---------- */

/** a new frame continues from the current one: players & equipment stay, arrows are left behind */
export function continueFrame(f: Frame): Frame {
  return { id: uid(), els: f.els.filter((e) => e.t !== "line" && e.t !== "pen") };
}

const lerpAngle = (a: number, b: number, t: number) => a + angleDelta(a, b) * t;

function lerpEl(a: El, b: El, t: number): El {
  if (a.t !== b.t) return t < 0.5 ? a : b;
  switch (b.t) {
    case "token": {
      const A = a as TokenEl;
      return { ...b, x: lerp(A.x, b.x, t), y: lerp(A.y, b.y, t), s: lerp(A.s, b.s, t) };
    }
    case "art": {
      const A = a as ArtEl;
      return { ...b, x: lerp(A.x, b.x, t), y: lerp(A.y, b.y, t), s: lerp(A.s, b.s, t), r: lerpAngle(A.r, b.r, t) };
    }
    case "shape": {
      const A = a as ShapeEl;
      return { ...b, x: lerp(A.x, b.x, t), y: lerp(A.y, b.y, t), w: lerp(A.w, b.w, t), h: lerp(A.h, b.h, t), r: lerpAngle(A.r, b.r, t) };
    }
    case "text": {
      const A = a as TextEl;
      return { ...b, x: lerp(A.x, b.x, t), y: lerp(A.y, b.y, t), r: lerpAngle(A.r, b.r, t) };
    }
    case "line": {
      const A = a as LineEl;
      const ac = A.c ?? { x: (A.a.x + A.b.x) / 2, y: (A.a.y + A.b.y) / 2 };
      const bc = b.c ?? { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 };
      return { ...b, a: lerpP(A.a, b.a, t), b: lerpP(A.b, b.b, t), c: A.c || b.c ? lerpP(ac, bc, t) : undefined };
    }
    default:
      return t < 0.5 ? a : b;
  }
}

/** elements of frame `from` morphing into frame `to` */
export function tween(from: Frame, to: Frame, t: number): El[] {
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
  const byId = new Map(from.els.map((x) => [x.id, x]));
  const out: El[] = [];
  const toIds = new Set(to.els.map((x) => x.id));
  for (const a of from.els) if (!toIds.has(a.id)) out.push({ ...a, o: (a.o ?? 1) * Math.max(0, 1 - e * 1.6) });
  for (const b of to.els) {
    const a = byId.get(b.id);
    out.push(a ? lerpEl(a, b, e) : { ...b, o: (b.o ?? 1) * Math.max(0, e * 1.6 - 0.6) });
  }
  return out;
}

/* ---------- misc ---------- */

export function boardDims(b: Board) {
  return boardSize(b.pitch);
}

export function isInside(p: P, W: number, H: number, pad = 0) {
  return p.x >= -pad && p.y >= -pad && p.x <= W + pad && p.y <= H + pad;
}

/** snap a line end to the edge of a token / equipment under it */
export function snapEnd(p: P, other: P, els: El[], u: number, skipId?: string): P {
  let best: { c: P; r: number; d: number } | null = null;
  for (const e of els) {
    if (e.id === skipId) continue;
    let r = 0;
    if (e.t === "token") r = tokenRadius(e, u);
    else if (e.t === "art" && (e.art === "coach" || e.art === "ball" || e.art === "marker" || e.art === "cone3d" || e.art === "cone")) r = (artDims(e, u).w + artDims(e, u).h) / 4;
    else continue;
    const d = dist(p, e);
    if (d <= r + 4 && (!best || d < best.d)) best = { c: { x: e.x, y: e.y }, r, d };
  }
  if (!best) return p;
  const dx = other.x - best.c.x, dy = other.y - best.c.y;
  const l = Math.hypot(dx, dy);
  if (l < best.r * 1.6) return p;
  const gap = best.r + 2.5;
  return { x: best.c.x + (dx / l) * gap, y: best.c.y + (dy / l) * gap };
}
