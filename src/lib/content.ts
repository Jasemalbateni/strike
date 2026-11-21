/* «ماذا أخذ اللاعب»: يربط حضور اللاعب بمحتوى الحصة (المحور الفني + الهدف البدني لكل تمرين).
 * محتوى الحصة = تمارين خطة ذلك اليوم في التقويم (مع مجموعة A/B)، وإن لم توجد خطة فأوراق التمرين المعتمدة المؤرخة بنفس اليوم.
 * دوال صافية بدون قاعدة بيانات عشان تنفحص بسهولة. */
import { PHYSICAL, cleanPhysical, type PhysicalKey } from "./physical";
import { isMatch, normalizeDrills, type SheetDrill } from "./sheets";
import type { Evaluation } from "./development";
import type { AttendanceStatus, Squad } from "./players";

export type AxisKey = "R" | "D" | "P" | "S" | "DF";

/** المحاور الفنية — نفس حروف رموز أوراق التمرين (STK-R10, STK-DF01 …) */
export const AXES: { key: AxisKey; label: string; /** skill of the player evaluation it is compared with */ skill: string }[] = [
  { key: "R", label: "الجري بالكرة", skill: "ball_control" },
  { key: "D", label: "المراوغة", skill: "dribbling" },
  { key: "P", label: "التمرير", skill: "passing" },
  { key: "S", label: "التسديد", skill: "shooting" },
  { key: "DF", label: "الدفاع", skill: "defending" },
];
const CAT_AXIS: Record<string, AxisKey> = { "تمرير واستقبال": "P", "المراوغة والتحكم": "D", "التسديد": "S", "الدفاع 1v1": "DF" };

/** the technical axis of a drill: the letters of its code first (R and D share one category), else its category; warm-ups and matches have none */
export function axisOf(d: Pick<SheetDrill, "type" | "code" | "cat">): AxisKey | null {
  if (isMatch(d)) return null;
  const m = (d.code || "").toUpperCase().replace(/^\s*STK[\s\-–]*/, "").match(/^[A-Z]+/);
  if (m && AXES.some((a) => a.key === m[0])) return m[0] as AxisKey;
  return CAT_AXIS[d.cat] ?? null;
}

export type Mark = { date: string; status: AttendanceStatus; squad: Squad | null };
export type PlanRow = { item_date: string; group_id: string | null; squad: Squad | null; sheet_index: number | null; drills: unknown };
export type DatedSheet = { session_date: string | null; drills: unknown };

export type ContentRow = { key: string; label: string; offered: number; attended: number; score: number | null };
export type PhysRow = { key: PhysicalKey; label: string; main: number; extra: number };
export type ContentAlert = { tone: "gap" | "stuck"; title: string; text: string };
export type RecentSession = { date: string; present: boolean; squad: Squad | null; tech: string[]; main: string[]; extra: string[]; planned: boolean };
export type PlayerContent = {
  marked: number;
  attended: number;
  /** attended sessions whose content is known */
  covered: number;
  tech: ContentRow[];
  phys: PhysRow[];
  /** scale of the physical bars */
  physMax: number;
  /** false until at least one of his sessions carries a physical goal */
  physTracked: boolean;
  physNever: string[];
  alerts: ContentAlert[];
  recent: RecentSession[];
  /** attended, but the session was split A/B and his squad wasn't chosen */
  needSquad: number;
};

const isPresent = (s: AttendanceStatus) => s === "present" || s === "late";
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

function drillsOfDay(mark: Mark, squad: Squad | null, groupId: string | null, plan: PlanRow[], sheets: DatedSheet[]): { drills: SheetDrill[]; split: boolean } {
  const rows = plan.filter((r) => r.item_date === mark.date && (!r.group_id || !groupId || r.group_id === groupId));
  if (rows.length) {
    const split = rows.some((r) => r.squad);
    const mine = rows.filter((r) => !r.squad || r.squad === squad);
    const drills = mine.flatMap((r) => {
      const all = normalizeDrills(r.drills);
      return r.sheet_index === null ? all : all[r.sheet_index] ? [all[r.sheet_index]] : [];
    });
    return { drills, split };
  }
  return { drills: sheets.filter((s) => s.session_date === mark.date).flatMap((s) => normalizeDrills(s.drills)), split: false };
}

export function buildContent({ marks, plan, sheets, groupId, evals }: { marks: Mark[]; plan: PlanRow[]; sheets: DatedSheet[]; groupId: string | null; evals: Evaluation[] }): PlayerContent {
  const sorted = [...marks].sort((a, b) => a.date.localeCompare(b.date));
  const tech = new Map<AxisKey, { offered: number; attended: number; dates: string[] }>();
  const phys = new Map<PhysicalKey, { main: number; extra: number; dates: string[] }>();
  const recent: RecentSession[] = [];
  let needSquad = 0;
  let covered = 0;
  let physTracked = false;
  let usual: Squad | null = null; // the squad he trained with most recently — what he "missed" when absent

  for (const m of sorted) {
    const present = isPresent(m.status);
    if (present && m.squad) usual = m.squad;
    const squad = present ? m.squad : usual;
    const { drills, split } = drillsOfDay(m, squad, groupId, plan, sheets);
    if (present && split && !m.squad) needSquad++;

    const axes = uniq(drills.map(axisOf).filter((a): a is AxisKey => a !== null));
    const cleaned = drills.map((d) => cleanPhysical(d.phys, d.phys2));
    const main = uniq(cleaned.map((c) => c.phys).filter((k): k is PhysicalKey => k !== ""));
    const extra = uniq(cleaned.flatMap((c) => c.phys2)).filter((k) => !main.includes(k));
    if (main.length || extra.length) physTracked = true;
    if (present && drills.length) covered++;

    for (const a of axes) {
      const t = tech.get(a) ?? { offered: 0, attended: 0, dates: [] };
      t.offered++;
      if (present) {
        t.attended++;
        t.dates.push(m.date);
      }
      tech.set(a, t);
    }
    if (present) {
      for (const k of main) {
        const p = phys.get(k) ?? { main: 0, extra: 0, dates: [] };
        p.main++;
        p.dates.push(m.date);
        phys.set(k, p);
      }
      for (const k of extra) {
        const p = phys.get(k) ?? { main: 0, extra: 0, dates: [] };
        p.extra++;
        phys.set(k, p);
      }
    }
    recent.push({ date: m.date, present, squad: present ? m.squad : null, tech: axes.map((a) => AXES.find((x) => x.key === a)!.label), main: main.map(label), extra: extra.map(label), planned: drills.length > 0 });
  }

  const scored = (skill: string) => evals.filter((e) => typeof e.scores?.[skill] === "number" && e.scores[skill] > 0).sort((a, b) => a.eval_date.localeCompare(b.eval_date) || a.created_at.localeCompare(b.created_at));
  const latest = (skill: string) => {
    const s = scored(skill);
    return s.length ? s[s.length - 1].scores[skill] : null;
  };

  const alerts: ContentAlert[] = [];
  /** enough sessions between two evaluations and the score didn't move */
  const stuck = (what: string, skill: string | undefined, dates: string[]) => {
    if (!skill) return;
    const s = scored(skill);
    if (s.length < 2) return;
    const [prev, last] = [s[s.length - 2], s[s.length - 1]];
    const between = dates.filter((d) => d > prev.eval_date && d <= last.eval_date).length;
    const now = last.scores[skill];
    if (between >= 3 && now <= prev.scores[skill] && now <= 3) alerts.push({ tone: "stuck", title: `${what} ما تطورت`, text: `أخذ ${between} حصص بين آخر تقييمين والتقييم ثابت على ${now}. راجع التمرين أو خصّص له شغل.` });
  };

  const techRows: ContentRow[] = AXES.filter((a) => tech.has(a.key)).map((a) => {
    const t = tech.get(a.key)!;
    if (t.offered >= 3 && t.attended / t.offered <= 0.5) alerts.push({ tone: "gap", title: `${a.label} ناقص`, text: `أخذ ${t.attended} من ${t.offered} حصص. السبب غياب، مو مستوى.` });
    stuck(a.label, a.skill, t.dates);
    return { key: a.key, label: a.label, offered: t.offered, attended: t.attended, score: latest(a.skill) };
  });
  techRows.sort((a, b) => b.offered - a.offered);

  const physRows: PhysRow[] = PHYSICAL.filter((p) => phys.has(p.key)).map((p) => {
    const v = phys.get(p.key)!;
    stuck(p.label, p.skill, v.dates);
    return { key: p.key, label: p.label, main: v.main, extra: v.extra };
  });
  physRows.sort((a, b) => b.main - a.main || b.extra - a.extra);

  return {
    marked: sorted.length,
    attended: sorted.filter((m) => isPresent(m.status)).length,
    covered,
    tech: techRows,
    phys: physRows,
    physMax: Math.max(1, ...physRows.map((p) => p.main + p.extra)),
    physTracked,
    physNever: physTracked ? PHYSICAL.filter((p) => !phys.has(p.key)).map((p) => p.label) : [],
    alerts: alerts.sort((a, b) => Number(a.tone === "stuck") - Number(b.tone === "stuck")),
    recent: recent.reverse().slice(0, 6),
    needSquad,
  };
}

function label(k: PhysicalKey) {
  return PHYSICAL.find((p) => p.key === k)!.label;
}
