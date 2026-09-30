/* Colour helpers for the tactics board. */

function parse(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(r: number, g: number, b: number) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** linear mix: t = 0 → a, t = 1 → b */
export function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return hex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export const darken = (c: string, t: number) => mix(c, "#000000", t);
export const lighten = (c: string, t: number) => mix(c, "#ffffff", t);

export function luminance(c: string) {
  const [r, g, b] = parse(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** readable text colour on top of `bg` */
export function contrastText(bg: string) {
  return luminance(bg) > 0.45 ? "#14213f" : "#ffffff";
}

export function isHex(v: string) {
  return /^#[0-9a-f]{6}$/i.test(v);
}

export type Swatch = { c: string; name: string };

/** STRIKE brand first, then the colours coaches use for bibs / cones */
export const SWATCHES: Swatch[] = [
  { c: "#1C2D5A", name: "كحلي" },
  { c: "#4DA8FF", name: "أزرق ثلجي" },
  { c: "#E7B53C", name: "ذهبي" },
  { c: "#FFFFFF", name: "أبيض" },
  { c: "#C7CED9", name: "فضي" },
  { c: "#141414", name: "أسود" },
  { c: "#E84C3D", name: "أحمر" },
  { c: "#F2994A", name: "برتقالي" },
  { c: "#FFE14D", name: "أصفر" },
  { c: "#7CCF84", name: "أخضر" },
  { c: "#9B6BDF", name: "بنفسجي" },
  { c: "#FF7AB6", name: "وردي" },
];

export const BRAND = {
  navy: "#1C2D5A",
  navy900: "#14213f",
  ice: "#4DA8FF",
  gold: "#E7B53C",
  silver: "#C7CED9",
  error: "#D64545",
};
