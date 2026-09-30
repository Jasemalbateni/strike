/* Geometry for the tactics board: vectors, curves, line patterns, arrowheads, bounds. */
import type { Dash, Heads, LineEl, P, PenEl, Pattern } from "./types";

export const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k });
export const len = (a: P) => Math.hypot(a.x, a.y);
export const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpP = (a: P, b: P, t: number): P => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export function norm(a: P): P {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
}
/** left-hand normal (screen space, y down) */
export const perp = (a: P): P => ({ x: -a.y, y: a.x });

export function rotateP(p: P, deg: number, o: P = { x: 0, y: 0 }): P {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const dx = p.x - o.x, dy = p.y - o.y;
  return { x: o.x + dx * c - dy * s, y: o.y + dx * s + dy * c };
}

const f = (n: number) => Math.round(n * 100) / 100;
export const fp = (p: P) => `${f(p.x)} ${f(p.y)}`;

/* ---------- quadratic curve through a middle point ---------- */

/** control point of the quadratic that passes through `c` at t = 0.5 */
export const ctrlOf = (a: P, b: P, c: P): P => ({ x: 2 * c.x - (a.x + b.x) / 2, y: 2 * c.y - (a.y + b.y) / 2 });

export function qAt(a: P, q: P, b: P, t: number): P {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * q.x + t * t * b.x, y: u * u * a.y + 2 * u * t * q.y + t * t * b.y };
}

export function qTan(a: P, q: P, b: P, t: number): P {
  return norm({ x: 2 * (1 - t) * (q.x - a.x) + 2 * t * (b.x - q.x), y: 2 * (1 - t) * (q.y - a.y) + 2 * t * (b.y - q.y) });
}

/** exact sub-curve [t0, t1] of a quadratic */
function qSub(a: P, q: P, b: P, t0: number, t1: number) {
  const p0 = qAt(a, q, b, t0);
  const p2 = qAt(a, q, b, t1);
  const d = { x: (1 - t0) * (q.x - a.x) + t0 * (b.x - q.x), y: (1 - t0) * (q.y - a.y) + t0 * (b.y - q.y) };
  const p1 = add(p0, mul(d, t1 - t0));
  return { p0, p1, p2 };
}

/* ---------- arc-length sampled path ---------- */

type Sampled = { pts: P[]; ts: number[]; cum: number[]; total: number; curve: { a: P; q: P; b: P } | null };

export function sampleLine(a: P, b: P, c?: P): Sampled {
  if (!c) {
    const l = dist(a, b);
    return { pts: [a, b], ts: [0, 1], cum: [0, l], total: l, curve: null };
  }
  const q = ctrlOf(a, b, c);
  const N = 72;
  const pts: P[] = [];
  const ts: number[] = [];
  const cum: number[] = [0];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(qAt(a, q, b, t));
    ts.push(t);
    if (i > 0) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  }
  return { pts, ts, cum, total: cum[N], curve: { a, q, b } };
}

export function samplePolyline(points: P[]): Sampled {
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  return { pts: points, ts: points.map((_, i) => i / Math.max(1, points.length - 1)), cum, total: cum[cum.length - 1] ?? 0, curve: null };
}

/** point, tangent and curve parameter at arc length s */
export function at(sm: Sampled, s: number): { p: P; tan: P; t: number } {
  const { pts, cum, ts } = sm;
  if (pts.length < 2) return { p: pts[0] ?? { x: 0, y: 0 }, tan: { x: 1, y: 0 }, t: 0 };
  s = Math.max(0, Math.min(sm.total, s));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const k = (s - cum[i - 1]) / seg;
  const p = lerpP(pts[i - 1], pts[i], k);
  const t = lerp(ts[i - 1], ts[i], k);
  const tan = sm.curve ? qTan(sm.curve.a, sm.curve.q, sm.curve.b, t) : norm(sub(pts[i], pts[i - 1]));
  return { p, tan, t };
}

/* ---------- arrowheads ---------- */

export function headSize(w: number) {
  return { L: 3.3 * w + 7.5, H: 1.5 * w + 4.6 };
}

function headPath(tip: P, dir: P, w: number) {
  const { L, H } = headSize(w);
  const base = sub(tip, mul(dir, L));
  const n = perp(dir);
  const p1 = add(base, mul(n, H));
  const p2 = sub(base, mul(n, H));
  const notch = sub(tip, mul(dir, L * 0.76));
  return `M${fp(tip)}L${fp(p1)}L${fp(notch)}L${fp(p2)}Z`;
}

/* ---------- dash patterns ---------- */

export function dashArray(dash: Dash, w: number): string | undefined {
  if (dash === "dashed") return `${f(2.6 * w + 7)} ${f(1.9 * w + 7)}`;
  if (dash === "dotted") return `0.01 ${f(1.9 * w + 4)}`;
  return undefined;
}

/* ---------- line geometry ---------- */

export type LineGeo = { d: string; heads: string[]; hit: string };

function patternPoints(sm: Sampled, s0: number, s1: number, pattern: Pattern, w: number): P[] {
  const span = s1 - s0;
  const pts: P[] = [at(sm, s0).p];
  const lead = Math.min(8 + w * 1.5, span * 0.18);
  const zs = s0 + lead, ze = s1 - lead;
  const zspan = ze - zs;
  const wl = 13 + 2.4 * w; // wavelength
  const amp = 3.6 + 1.15 * w;
  if (zspan > wl * 0.6) {
    const n = Math.max(2, Math.round(zspan / (wl / 2)));
    const step = zspan / n;
    pts.push(at(sm, zs).p);
    if (pattern === "zigzag") {
      for (let i = 1; i <= n; i++) {
        const s = zs + (i - 0.5) * step;
        const { p, tan } = at(sm, s);
        pts.push(add(p, mul(perp(tan), (i % 2 ? 1 : -1) * amp)));
      }
    } else {
      const k = Math.max(6, Math.ceil(zspan / 1.6));
      for (let i = 1; i < k; i++) {
        const s = zs + (i / k) * zspan;
        const { p, tan } = at(sm, s);
        pts.push(add(p, mul(perp(tan), Math.sin((Math.PI * (s - zs)) / step) * amp)));
      }
    }
    pts.push(at(sm, ze).p);
  }
  pts.push(at(sm, s1).p);
  return pts;
}

export function lineGeometry(el: Pick<LineEl, "a" | "b" | "c" | "w" | "pattern" | "heads">): LineGeo {
  const sm = sampleLine(el.a, el.b, el.c);
  return geometryFromSampled(sm, el.w, el.pattern, el.heads);
}

function geometryFromSampled(sm: Sampled, w: number, pattern: Pattern, heads: Heads): LineGeo {
  const total = sm.total;
  const { L } = headSize(w);
  const headEnd = heads === "end" || heads === "both";
  const headStart = heads === "both";
  // keep heads proportionate on very short lines
  const cut = Math.min(L * 0.7, total * 0.3);
  const s0 = headStart ? cut : 0;
  const s1 = headEnd ? total - cut : total;
  let d: string;
  if (pattern === "plain") {
    if (sm.curve) {
      const t0 = at(sm, s0).t, t1 = at(sm, s1).t;
      const { p0, p1, p2 } = qSub(sm.curve.a, sm.curve.q, sm.curve.b, t0, t1);
      d = `M${fp(p0)}Q${fp(p1)} ${fp(p2)}`;
    } else if (sm.pts.length === 2) {
      d = `M${fp(at(sm, s0).p)}L${fp(at(sm, s1).p)}`;
    } else {
      d = smoothPath(trimPoints(sm, s0, s1));
    }
  } else {
    const pts = patternPoints(sm, s0, s1, pattern, w);
    d = "M" + pts.map(fp).join("L");
  }
  const hs: string[] = [];
  if (total > 1) {
    if (headEnd) {
      const e = at(sm, total);
      hs.push(headPath(e.p, endTangent(sm, true), w));
    }
    if (headStart) {
      const s = at(sm, 0);
      hs.push(headPath(s.p, mul(endTangent(sm, false), -1), w));
    }
  }
  const hit = sm.curve ? `M${fp(sm.curve.a)}Q${fp(sm.curve.q)} ${fp(sm.curve.b)}` : "M" + sm.pts.map(fp).join("L");
  return { d, heads: hs, hit };
}

/** tangent at the ends; for freehand paths average over the last few units so the head follows the stroke */
function endTangent(sm: Sampled, end: boolean): P {
  if (sm.curve) return end ? qTan(sm.curve.a, sm.curve.q, sm.curve.b, 1) : qTan(sm.curve.a, sm.curve.q, sm.curve.b, 0);
  const span = Math.min(14, sm.total * 0.25);
  if (end) return norm(sub(at(sm, sm.total).p, at(sm, sm.total - span).p));
  return norm(sub(at(sm, span).p, at(sm, 0).p));
}

function trimPoints(sm: Sampled, s0: number, s1: number): P[] {
  const out: P[] = [at(sm, s0).p];
  for (let i = 0; i < sm.pts.length; i++) if (sm.cum[i] > s0 && sm.cum[i] < s1) out.push(sm.pts[i]);
  out.push(at(sm, s1).p);
  return out;
}

/** smooth freehand polyline through midpoints */
export function smoothPath(pts: P[]) {
  if (pts.length < 3) return "M" + pts.map(fp).join("L");
  let d = `M${fp(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) d += `Q${fp(pts[i])} ${fp(mid(pts[i], pts[i + 1]))}`;
  d += `L${fp(pts[pts.length - 1])}`;
  return d;
}

export function penGeometry(el: Pick<PenEl, "pts" | "w" | "heads">): LineGeo {
  const sm = samplePolyline(el.pts);
  const g = geometryFromSampled(sm, el.w, "plain", el.heads);
  return { ...g, hit: smoothPath(el.pts) };
}

/** Ramer–Douglas–Peucker simplification for freehand strokes */
export function simplify(points: P[], eps: number): P[] {
  if (points.length < 3) return points;
  const first = points[0], last = points[points.length - 1];
  let idx = -1, maxD = 0;
  const L = dist(first, last) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const d = Math.abs((last.y - first.y) * p.x - (last.x - first.x) * p.y + last.x * first.y - last.y * first.x) / L;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const a = simplify(points.slice(0, idx + 1), eps);
    const b = simplify(points.slice(idx), eps);
    return a.slice(0, -1).concat(b);
  }
  return [first, last];
}

/* ---------- rectangles ---------- */

export type Box = { x0: number; y0: number; x1: number; y1: number };

export const boxOf = (pts: P[], pad = 0): Box => ({
  x0: Math.min(...pts.map((p) => p.x)) - pad,
  y0: Math.min(...pts.map((p) => p.y)) - pad,
  x1: Math.max(...pts.map((p) => p.x)) + pad,
  y1: Math.max(...pts.map((p) => p.y)) + pad,
});

export const boxesIntersect = (a: Box, b: Box) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

/** axis-aligned half extents of a rotated w × h box */
export function rotatedHalf(w: number, h: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return { hx: (w / 2) * c + (h / 2) * s, hy: (w / 2) * s + (h / 2) * c };
}

/** shortest signed angle difference */
export function angleDelta(a: number, b: number) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function normAngle(a: number) {
  let r = a % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return Math.round(r * 10) / 10;
}
