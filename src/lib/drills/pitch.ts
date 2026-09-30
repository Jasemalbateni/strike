/* Pitch backgrounds. Drawn in a canonical (un-rotated) frame; `vertical` rotates the board 90° clockwise. */
import type { Pitch, PitchKind, PitchStyle } from "./types";

const M = 10; // units per metre

type Canon = { cw: number; ch: number; margin: number };

/** canonical board size (landscape for full/small/plain, goal-at-top for half/box) */
export function canon(kind: PitchKind): Canon {
  switch (kind) {
    case "full":
      return { cw: (105 + 8) * M, ch: (68 + 8) * M, margin: 4 * M };
    case "half":
      return { cw: (68 + 8) * M, ch: (52.5 + 8) * M, margin: 4 * M };
    case "box":
      return { cw: (68 + 8) * M, ch: (32 + 4) * M, margin: 4 * M };
    case "small":
      return { cw: (40 + 6) * M, ch: (20 + 6) * M, margin: 3 * M };
    case "plain":
    default:
      return { cw: (105 + 8) * M, ch: (68 + 8) * M, margin: 4 * M };
  }
}

/** board size in world units (what elements live in) */
export function boardSize(p: Pick<Pitch, "kind" | "vertical">) {
  const c = canon(p.kind);
  return p.vertical ? { W: c.ch, H: c.cw } : { W: c.cw, H: c.ch };
}

/** default token diameter per pitch kind */
export function defaultUnit(kind: PitchKind) {
  return { full: 30, half: 32, box: 34, small: 30, plain: 32 }[kind];
}

export const PITCH_KINDS: { v: PitchKind; label: string }[] = [
  { v: "full", label: "ملعب كامل" },
  { v: "half", label: "نصف ملعب" },
  { v: "box", label: "منطقة الجزاء" },
  { v: "small", label: "ملعب مصغّر" },
  { v: "plain", label: "بدون خطوط" },
];

export const PITCH_STYLES: { v: PitchStyle; label: string; bg: string; stripe: string; line: string }[] = [
  { v: "grass", label: "عشب", bg: "#3f8e47", stripe: "#46994e", line: "#ffffff" },
  { v: "dark", label: "عشب داكن", bg: "#2c6a38", stripe: "#317540", line: "#f2f5f9" },
  { v: "navy", label: "كحلي", bg: "#1c2d5a", stripe: "#203364", line: "#c7ced9" },
  { v: "white", label: "أبيض", bg: "#ffffff", stripe: "#f4f6fa", line: "#1c2d5a" },
];

export function pitchColors(p: Pitch) {
  if (p.style === "custom") {
    const bg = p.bg ?? "#3f8e47";
    return { bg, stripe: shade(bg), line: p.line ?? "#ffffff" };
  }
  const s = PITCH_STYLES.find((x) => x.v === p.style) ?? PITCH_STYLES[0];
  return { bg: s.bg, stripe: s.stripe, line: p.line ?? s.line };
}

function shade(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const k = lum > 0.6 ? -10 : 9;
  const c = (v: number) => Math.max(0, Math.min(255, v + k)).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** true when lines/tokens should default to a dark colour on this pitch */
export function isLightPitch(p: Pitch) {
  const { bg } = pitchColors(p);
  const n = parseInt(bg.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

/* ---------- markings (canonical coordinates) ---------- */

const f = (n: number) => Math.round(n * 100) / 100;

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  // degrees, clockwise in screen space from a0 to a1
  const p0 = [cx + r * Math.cos((a0 * Math.PI) / 180), cy + r * Math.sin((a0 * Math.PI) / 180)];
  const p1 = [cx + r * Math.cos((a1 * Math.PI) / 180), cy + r * Math.sin((a1 * Math.PI) / 180)];
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${f(p0[0])} ${f(p0[1])}A${f(r)} ${f(r)} 0 ${large} 1 ${f(p1[0])} ${f(p1[1])}`;
}

const rect = (x: number, y: number, w: number, h: number) => `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;

export type Markings = { lines: string; spots: string; goals: string };

export function markings(kind: PitchKind): Markings | null {
  const { cw, ch, margin: m } = canon(kind);
  const L: string[] = [];
  const S: string[] = [];
  const G: string[] = [];
  if (kind === "plain") return null;

  if (kind === "full") {
    const len = 105 * M, wid = 68 * M, cy = m + wid / 2;
    L.push(rect(m, m, len, wid));
    L.push(`M${f(m + len / 2)} ${f(m)}V${f(m + wid)}`);
    L.push(circle(m + len / 2, cy, 9.15 * M));
    S.push(circle(m + len / 2, cy, 0.45 * M));
    for (const side of [0, 1]) {
      const gx = side === 0 ? m : m + len; // goal line x
      const dir = side === 0 ? 1 : -1;
      const pa = 16.5 * M, pw = 40.32 * M, ga = 5.5 * M, gw = 18.32 * M;
      L.push(rect(side === 0 ? gx : gx - pa, cy - pw / 2, pa, pw));
      L.push(rect(side === 0 ? gx : gx - ga, cy - gw / 2, ga, gw));
      const spot = gx + dir * 11 * M;
      S.push(circle(spot, cy, 0.35 * M));
      const ang = (Math.acos((5.5 * M) / (9.15 * M)) * 180) / Math.PI; // 53.13°
      L.push(side === 0 ? arc(spot, cy, 9.15 * M, -ang, ang) : arc(spot, cy, 9.15 * M, 180 - ang, 180 + ang));
      const gd = 2 * M, gwid = 7.32 * M;
      G.push(rect(side === 0 ? gx - gd : gx, cy - gwid / 2, gd, gwid));
    }
    // corner arcs
    const r = 1 * M;
    L.push(arc(m, m, r, 0, 90), arc(m + len, m, r, 90, 180), arc(m + len, m + wid, r, 180, 270), arc(m, m + wid, r, 270, 360));
  }

  if (kind === "half" || kind === "box") {
    const wid = 68 * M, cx = m + wid / 2;
    const depth = kind === "half" ? 52.5 * M : 32 * M;
    if (kind === "half") L.push(rect(m, m, wid, depth));
    else L.push(`M${f(m)} ${f(m + depth + 4 * M)}V${f(m)}H${f(m + wid)}V${f(m + depth + 4 * M)}`);
    const pa = 16.5 * M, pw = 40.32 * M, ga = 5.5 * M, gw = 18.32 * M;
    L.push(rect(cx - pw / 2, m, pw, pa));
    L.push(rect(cx - gw / 2, m, gw, ga));
    const spot = m + 11 * M;
    S.push(circle(cx, spot, 0.35 * M));
    const ang = (Math.acos((5.5 * M) / (9.15 * M)) * 180) / Math.PI;
    L.push(arc(cx, spot, 9.15 * M, 90 - ang, 90 + ang));
    const r = 1 * M;
    L.push(arc(m, m, r, 0, 90), arc(m + wid, m, r, 90, 180));
    if (kind === "half") {
      L.push(arc(cx, m + depth, 9.15 * M, 180, 360));
      S.push(circle(cx, m + depth, 0.45 * M));
    }
    const gd = 2 * M, gwid = 7.32 * M;
    G.push(rect(cx - gwid / 2, m - gd, gwid, gd));
  }

  if (kind === "small") {
    const len = 40 * M, wid = 20 * M, cy = m + wid / 2;
    L.push(rect(m, m, len, wid));
    L.push(`M${f(m + len / 2)} ${f(m)}V${f(m + wid)}`);
    L.push(circle(m + len / 2, cy, 3 * M));
    S.push(circle(m + len / 2, cy, 0.35 * M));
    const R = 6 * M;
    L.push(arc(m, cy, R, -90, 90));
    L.push(arc(m + len, cy, R, 90, 270));
    S.push(circle(m + 6 * M, cy, 0.3 * M), circle(m + len - 6 * M, cy, 0.3 * M));
    const gd = 1.2 * M, gwid = 3 * M;
    G.push(rect(m - gd, cy - gwid / 2, gd, gwid), rect(m + len, cy - gwid / 2, gd, gwid));
  }

  void cw;
  void ch;
  return { lines: L.join(""), spots: S.join(""), goals: G.join("") };
}

/** stripe bands (canonical), perpendicular to the length of the pitch */
export function stripes(kind: PitchKind) {
  const { cw, ch } = canon(kind);
  const alongY = kind === "half" || kind === "box";
  const total = alongY ? ch : cw;
  const n = kind === "small" ? 8 : kind === "box" ? 6 : kind === "half" ? 10 : 18;
  const band = total / n;
  const out: string[] = [];
  for (let i = 0; i < n; i += 2) {
    out.push(alongY ? rect(0, i * band, cw, band) : rect(i * band, 0, band, ch));
  }
  return out.join("");
}
