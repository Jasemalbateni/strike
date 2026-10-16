/* Drill sheets (ورقة التمرين): an uploaded diagram + written content, printed as A4.
 * A sheet is either one drill or a full session made of several drills. */

export type SheetKind = "drill" | "session";

export type SheetDrill = {
  id: string;
  title: string;
  code: string;
  cat: string;
  age: string;
  dur: string;
  players: string;
  area: string;
  intensity: string;
  desc: string;
  obj: string;
  eq: string;
  pts: string;
  prog: string;
  /** public URL of the uploaded diagram (storage bucket drill-sheets) */
  img: string;
};

export type DrillSheet = {
  id: string;
  kind: SheetKind;
  title: string;
  session_date: string | null;
  age_group: string;
  drills: SheetDrill[];
  author_id: string | null;
  created_at: string;
  updated_at: string;
};

export const SHEET_CATEGORIES = ["تمرير واستقبال", "المراوغة والتحكم", "التسديد", "الدفاع 1v1", "ألعاب مصغّرة", "الإحماء", "التنسيق الحركي", "أخرى"];
export const SHEET_AGES = ["5–6", "7–8", "9–10", "الكل"];
export const SHEET_INTENSITY = ["منخفضة", "متوسطة", "عالية"];

export const KIND_LABEL: Record<SheetKind, string> = { drill: "تمرين واحد", session: "حصة كاملة" };

export function newDrill(): SheetDrill {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()),
    title: "",
    code: "",
    cat: SHEET_CATEGORIES[0],
    age: SHEET_AGES[0],
    dur: "",
    players: "",
    area: "",
    intensity: "متوسطة",
    desc: "",
    obj: "",
    eq: "",
    pts: "",
    prog: "",
    img: "",
  };
}

/** rows safe to render: fills defaults for any field missing from stored JSON */
export function normalizeDrills(raw: unknown): SheetDrill[] {
  if (!Array.isArray(raw)) return [newDrill()];
  const out = raw.map((d) => ({ ...newDrill(), ...(d && typeof d === "object" ? (d as Partial<SheetDrill>) : {}) }));
  return out.length ? out : [newDrill()];
}

export function lines(t: string) {
  return (t || "")
    .split("\n")
    .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean);
}

export function totalMinutes(drills: SheetDrill[]) {
  return drills.reduce((n, d) => n + (parseInt(d.dur, 10) || 0), 0);
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}
