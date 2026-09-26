export const STAFF_EMAIL_DOMAIN = "staff.strike.kw";

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
}

export type StaffRole = "owner" | "branch_manager" | "admin" | "coach";

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "مالك الأكاديمية",
  branch_manager: "مدير فرع",
  admin: "إداري",
  coach: "مدرب",
};

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  role: StaffRole;
  marketing_access: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StaffName = { id: string; username: string; full_name: string };

/* ---------- marketing hub ---------- */
export type Platform =
  | "instagram"
  | "tiktok"
  | "snapchat"
  | "youtube"
  | "x"
  | "whatsapp"
  | "general";
export type Metric =
  | "followers"
  | "engagement"
  | "views"
  | "leads"
  | "subscribers"
  | "posts"
  | "budget"
  | "other";
export type PostFormat = "reel" | "story" | "carousel" | "post" | "tiktok" | "live" | "other";
export type PostStatus = "idea" | "draft" | "review" | "approved" | "scheduled" | "published";
export type PlanKind = "audience" | "pillar" | "campaign" | "channel" | "budget" | "other";
export type NoteColor = "ice" | "navy" | "gold" | "silver" | "white";

export const PLATFORMS: { value: Platform; label: string; short: string }[] = [
  { value: "instagram", label: "انستغرام", short: "IG" },
  { value: "tiktok", label: "تيك توك", short: "TT" },
  { value: "snapchat", label: "سناب شات", short: "SC" },
  { value: "youtube", label: "يوتيوب", short: "YT" },
  { value: "x", label: "X", short: "X" },
  { value: "whatsapp", label: "واتساب", short: "WA" },
  { value: "general", label: "عام", short: "•" },
];
export const platformLabel = (p: Platform) => PLATFORMS.find((x) => x.value === p)?.label ?? p;
export const platformShort = (p: Platform) => PLATFORMS.find((x) => x.value === p)?.short ?? p;

export const METRICS: { value: Metric; label: string; unit: string }[] = [
  { value: "followers", label: "متابعين", unit: "متابع" },
  { value: "engagement", label: "تفاعل", unit: "%" },
  { value: "views", label: "مشاهدات", unit: "مشاهدة" },
  { value: "leads", label: "طلبات تسجيل", unit: "طلب" },
  { value: "subscribers", label: "مشتركين جدد بالأكاديمية", unit: "مشترك" },
  { value: "posts", label: "عدد المنشورات", unit: "منشور" },
  { value: "budget", label: "ميزانية", unit: "د.ك" },
  { value: "other", label: "أخرى", unit: "" },
];
export const metricLabel = (m: Metric) => METRICS.find((x) => x.value === m)?.label ?? m;

export const FORMATS: { value: PostFormat; label: string }[] = [
  { value: "reel", label: "Reel" },
  { value: "story", label: "Story" },
  { value: "carousel", label: "Carousel" },
  { value: "post", label: "منشور" },
  { value: "tiktok", label: "TikTok" },
  { value: "live", label: "بث مباشر" },
  { value: "other", label: "أخرى" },
];
export const formatLabel = (f: PostFormat) => FORMATS.find((x) => x.value === f)?.label ?? f;

export const STATUSES: { value: PostStatus; label: string }[] = [
  { value: "idea", label: "فكرة" },
  { value: "draft", label: "مسودة" },
  { value: "review", label: "بانتظار الاعتماد" },
  { value: "approved", label: "معتمد" },
  { value: "scheduled", label: "مجدول" },
  { value: "published", label: "منشور" },
];
export const statusLabel = (s: PostStatus) => STATUSES.find((x) => x.value === s)?.label ?? s;

export const PLAN_KINDS: { value: PlanKind; label: string; hint: string }[] = [
  { value: "audience", label: "الجمهور المستهدف", hint: "مين نكلّم؟ أولياء الأمور، أعمار الأطفال، المناطق" },
  { value: "pillar", label: "ركيزة محتوى", hint: "نوع محتوى ثابت نكرره: نصيحة المدرب، لقطات التمرين، قصص الأهالي" },
  { value: "campaign", label: "حملة", hint: "فترة محددة بهدف واضح: تسجيل الموسم، رمضان، الصيف" },
  { value: "channel", label: "قناة", hint: "دور كل منصة ووتيرة النشر فيها" },
  { value: "budget", label: "ميزانية", hint: "توزيع الصرف: إعلانات، إنتاج، أدوات" },
  { value: "other", label: "أخرى", hint: "" },
];
export const planKindLabel = (k: PlanKind) => PLAN_KINDS.find((x) => x.value === k)?.label ?? k;

export const NOTE_COLORS: { value: NoteColor; label: string; cls: string }[] = [
  { value: "ice", label: "أزرق", cls: "note-ice" },
  { value: "navy", label: "كحلي", cls: "note-navy" },
  { value: "gold", label: "ذهبي", cls: "note-gold" },
  { value: "silver", label: "فضي", cls: "note-silver" },
  { value: "white", label: "أبيض", cls: "note-white" },
];
export const noteColorClass = (c: string) => NOTE_COLORS.find((x) => x.value === c)?.cls ?? "note-white";

export type Goal = {
  id: string;
  title: string;
  platform: Platform;
  metric: Metric;
  target_value: number;
  current_value: number;
  unit: string;
  period_start: string | null;
  period_end: string | null;
  notes: string;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanItem = {
  id: string;
  kind: PlanKind;
  title: string;
  body: string;
  platform: Platform;
  budget_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  color: string;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Idea = {
  id: string;
  title: string;
  body: string;
  category: string;
  color: string;
  platform: Platform;
  votes: number;
  is_note: boolean;
  archived: boolean;
  moved_post_id: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Post = {
  id: string;
  title: string;
  platform: Platform;
  format: PostFormat;
  caption: string;
  hashtags: string;
  media_url: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: PostStatus;
  assignee_id: string | null;
  campaign_id: string | null;
  idea_id: string | null;
  notes: string;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MetricRow = {
  id: string;
  platform: Platform;
  week_start: string;
  followers: number;
  reach: number;
  engagement: number;
  views: number;
  leads: number;
  spend: number;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Activity = {
  id: number;
  actor_id: string | null;
  actor_name: string;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string;
  created_at: string;
};
