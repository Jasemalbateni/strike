/* Drill library metadata */
import type { Board } from "./types";
import { bidi } from "@/lib/bidi";

export type DrillStatus = "draft" | "pending" | "approved" | "returned";

export type Drill = {
  id: string;
  title: string;
  description: string;
  coaching_points: string;
  category: string;
  age_group: string;
  duration_min: number | null;
  players: string;
  area: string;
  equipment: string;
  board: Board;
  status: DrillStatus;
  review_note: string;
  author_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DrillMeta = Pick<Drill, "title" | "description" | "coaching_points" | "category" | "age_group" | "duration_min" | "players" | "area" | "equipment">;

export const EMPTY_META: DrillMeta = { title: "", description: "", coaching_points: "", category: "", age_group: "", duration_min: null, players: "", area: "", equipment: "" };

export const CATEGORIES = [
  "إحماء",
  "تحكم واستلام",
  "تمرير",
  "قيادة ومراوغة",
  "تسديد",
  "دفاع",
  "حراسة مرمى",
  "تنسيق وحركة",
  "ألعاب مصغّرة",
  "تكتيك",
  "لياقة",
  "مباراة ختامية",
];

export const AGE_GROUPS = ["4–5", "6–7", "8–10", "11–13", "الكل"];

export const STATUS_LABEL: Record<DrillStatus, string> = {
  draft: "مسودة",
  pending: "بانتظار الاعتماد",
  approved: "في المكتبة",
  returned: "مُرجع للتعديل",
};

export const STATUS_CHIP: Record<DrillStatus, string> = {
  draft: "bg-silver-100 text-ink-2",
  pending: "bg-gold-100 text-navy-900",
  approved: "bg-ice-100 text-navy",
  returned: "bg-error-100 text-error",
};

export function metaLine(d: Pick<Drill, "category" | "duration_min" | "age_group" | "players">) {
  return bidi([d.category, d.duration_min ? `${d.duration_min} دقيقة` : null, d.age_group ? `فئة ${d.age_group}` : null, d.players ? `${d.players} لاعبين` : null].filter(Boolean).join(" · "));
}
