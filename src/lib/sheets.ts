/* Drill sheets (ورقة التمرين): an uploaded diagram + written content, printed as A4.
 * A sheet is either one drill or a full session made of several drills. */

export type SheetKind = "drill" | "session";

/** an item of a sheet: a drill, or (inside a session) a match */
export type SheetItemType = "drill" | "match";

export type SheetDrill = {
  id: string;
  /** defaults to "drill" for rows stored before matches existed */
  type?: SheetItemType;
  /** match format, e.g. "3 ضد 3" (matches only) */
  format?: string;
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
  /** the drawing (drills.id) this diagram was rendered from, if any — lets the coach reopen and redraw it */
  drill_id?: string | null;
};

export type SheetStatus = "draft" | "pending" | "approved" | "returned";

export type DrillSheet = {
  id: string;
  kind: SheetKind;
  title: string;
  session_date: string | null;
  age_group: string;
  drills: SheetDrill[];
  status: SheetStatus;
  review_note: string;
  author_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export const SHEET_STATUS_LABEL: Record<SheetStatus, string> = {
  draft: "مسودة",
  pending: "بانتظار الاعتماد",
  approved: "في المكتبة",
  returned: "مُرجع للتعديل",
};

export const SHEET_STATUS_CHIP: Record<SheetStatus, string> = {
  draft: "bg-silver-100 text-ink-2",
  pending: "bg-gold-100 text-navy-900",
  approved: "bg-ice-100 text-navy",
  returned: "bg-error-100 text-error",
};

/** one library entry per drill inside an approved sheet */
export type LibraryDrill = { sheet: DrillSheet; index: number; drill: SheetDrill };

export function flattenLibrary(sheets: DrillSheet[]): LibraryDrill[] {
  const out: LibraryDrill[] = [];
  // matches belong to their session, not to the drill library
  for (const sheet of sheets) normalizeDrills(sheet.drills).forEach((drill, index) => !isMatch(drill) && out.push({ sheet, index, drill }));
  return out;
}

export const isMatch = (d: Pick<SheetDrill, "type">) => d.type === "match";

export const MATCH_FORMATS = ["1 ضد 1", "2 ضد 2", "3 ضد 3", "4 ضد 4", "5 ضد 5", "أخرى"];

export function newMatch(): SheetDrill {
  return { ...newDrill(), type: "match", format: "3 ضد 3", title: "مباراة", cat: "ألعاب مصغّرة", intensity: "عالية" };
}

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
    drill_id: null,
    type: "drill",
    format: "",
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
