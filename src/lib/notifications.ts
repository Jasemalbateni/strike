import { format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";

export type NotifKind = "general" | "late" | "absence" | "drill_reminder" | "session_change";
export type NotifChannel = "site" | "whatsapp" | "both";

export type Notification = {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  kind: NotifKind;
  title: string;
  body: string;
  ref_date: string | null;
  link: string | null;
  channel: NotifChannel;
  whatsapp_sent_at: string | null;
  read_at: string | null;
  created_at: string;
};

/** "الاثنين 19/10/2026" */
export const sessionDate = (d: string) => format(parseISO(d), "EEEE d/M/yyyy", { locale: ar });

export const KINDS: {
  value: NotifKind;
  label: string;
  needsDate: boolean;
  title: (date: string | null) => string;
  link?: string;
}[] = [
  { value: "late", label: "تأخير", needsDate: true, title: (d) => `تم تدوين تأخير في حصة ${d ? sessionDate(d) : ""}`.trim() },
  { value: "absence", label: "غياب", needsDate: true, title: (d) => `تم تدوين غياب في حصة ${d ? sessionDate(d) : ""}`.trim() },
  { value: "drill_reminder", label: "تذكير بتمرين", needsDate: true, title: (d) => `تذكير: جهّز تمرين الحصة القادمة${d ? ` — ${sessionDate(d)}` : ""}`, link: "/sheets/new" },
  { value: "session_change", label: "تغيير حصة", needsDate: true, title: (d) => `تغيير في حصة ${d ? sessionDate(d) : ""}`.trim(), link: "/calendar" },
  { value: "general", label: "رسالة عامة", needsDate: false, title: () => "" },
];
export const kindOf = (k: NotifKind) => KINDS.find((x) => x.value === k) ?? KINDS[KINDS.length - 1];

export const CHANNELS: { value: NotifChannel; label: string; hint: string }[] = [
  { value: "site", label: "الموقع فقط", hint: "يظهر له لما يدخل حسابه" },
  { value: "whatsapp", label: "واتساب فقط", hint: "يفتح واتساب برسالة جاهزة" },
  { value: "both", label: "الموقع + واتساب", hint: "الاثنين معاً" },
];

/** Kuwait numbers: 8 digits → 965XXXXXXXX; strips spaces, +, leading 00 */
export function normalizePhone(raw: string | null | undefined) {
  let d = (raw ?? "").replace(/[^\d]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 8) d = "965" + d;
  return d.length >= 10 ? d : "";
}

export function waLink(phone: string, title: string, body: string) {
  const text = `*STRIKE* — ${title}${body ? `\n\n${body}` : ""}\n\nبوابة الفريق: https://team.strikekw.com`;
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}

/** "قبل 5 د" style relative time */
export function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "الآن";
  if (s < 3600) return `قبل ${Math.floor(s / 60)} د`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} س`;
  if (s < 7 * 86400) return `قبل ${Math.floor(s / 86400)} يوم`;
  return format(new Date(iso), "d/M/yyyy");
}
