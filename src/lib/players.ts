import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export type PlayerKind = "subscriber" | "trial";
export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export type Branch = { id: string; name: string; training_days: number[]; session_time: string | null; pitch_cost: number; is_active: boolean };
export type Group = { id: string; branch_id: string; name: string; age_min: number | null; age_max: number | null; position: number; is_active: boolean };

export type Player = {
  id: string;
  branch_id: string | null;
  group_id: string | null;
  full_name: string;
  age: number | null;
  guardian_name: string;
  guardian_phone: string;
  kind: PlayerKind;
  source: string;
  trial_date: string | null;
  converted_at: string | null;
  notes: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Subscription = {
  id: string;
  player_id: string;
  start_date: string;
  end_date: string;
  sessions_count: number;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  notes: string;
  created_at: string;
};

export type Session = { id: string; branch_id: string; session_date: string; cancelled: boolean; notes: string };
export type Attendance = { id: string; session_id: string; player_id: string; status: AttendanceStatus; marked_by: string | null; marked_at: string };

export const SOURCES = ["إعلان انستغرام", "إعلان واتساب", "تيك توك", "توصية صديق", "أقارب", "مرّ بالملعب", "أخرى"];

/** date of the Nth training session on/after `start` (days: 0=Sun … 6=Sat) — mirrors SQL nth_session_date */
export function nthSessionDate(start: string, days: number[], n: number): string {
  let d = parseISO(start);
  let c = 0;
  if (n < 1 || !days.length) return start;
  for (let i = 0; i < 400; i++) {
    if (days.includes(d.getDay())) {
      c++;
      if (c === n) return format(d, "yyyy-MM-dd");
    }
    d = addDays(d, 1);
  }
  return format(d, "yyyy-MM-dd");
}

export function isTrainingDay(dateISO: string, days: number[]) {
  return days.includes(parseISO(dateISO).getDay());
}

export type SubState = "active" | "expiring" | "expired" | "none";

/** subscription state for a player given his latest subscription and "today" */
export function subState(latest: Subscription | undefined, today: string): { state: SubState; daysLeft: number | null } {
  if (!latest) return { state: "none", daysLeft: null };
  const daysLeft = differenceInCalendarDays(parseISO(latest.end_date), parseISO(today));
  if (daysLeft < 0) return { state: "expired", daysLeft };
  if (daysLeft <= 7) return { state: "expiring", daysLeft };
  return { state: "active", daysLeft };
}

export const SUB_LABEL: Record<SubState, string> = {
  active: "مشترك",
  expiring: "ينتهي قريباً",
  expired: "منتهي",
  none: "بدون اشتراك",
};

export const DAY_SHORT = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function fmtDate(iso: string) {
  return format(parseISO(iso), "dd/MM/yyyy");
}

/** aggregated attendance per player (view player_attendance_stats) */
export type PlayerStats = {
  player_id: string;
  present_count: number;
  absent_count: number;
  late_count: number;
  last_present: string | null;
  first_present: string | null;
};

/** trial window: a trial player shows in the attendance list from his trial date for 3 weeks (≈9 sessions) */
export const TRIAL_WINDOW_DAYS = 21;

export function trialVisibleOn(p: Pick<Player, "kind" | "trial_date">, dateISO: string) {
  if (p.kind !== "trial" || !p.trial_date) return true;
  const diff = differenceInCalendarDays(parseISO(dateISO), parseISO(p.trial_date));
  return diff >= 0 && diff <= TRIAL_WINDOW_DAYS;
}

/** Kuwaiti numbers: 8 digits → +965 */
export function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 8) return "965" + digits;
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

export function waLink(raw: string) {
  const n = normalizePhone(raw);
  return n ? `https://wa.me/${n}` : "";
}

export function telLink(raw: string) {
  const n = normalizePhone(raw);
  return n ? `tel:+${n}` : "";
}

/** default start of the next subscription: the day after the last one ends, or today if it already expired */
export function nextStartDate(latest: Subscription | undefined, today: string) {
  if (!latest) return today;
  const dayAfter = format(addDays(parseISO(latest.end_date), 1), "yyyy-MM-dd");
  return dayAfter > today ? dayAfter : today;
}
