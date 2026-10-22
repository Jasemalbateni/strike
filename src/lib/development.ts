export type Pillar = "technical" | "tactical" | "physical" | "mental";

export const PILLARS: { key: Pillar; label: string; color: string; skills: { key: string; label: string }[] }[] = [
  {
    key: "technical",
    label: "فني",
    color: "#2a78d6",
    skills: [
      { key: "ball_control", label: "التحكم بالكرة" },
      { key: "first_touch", label: "الاستلام" },
      { key: "dribbling", label: "المراوغة" },
      { key: "passing", label: "التمرير" },
      { key: "shooting", label: "التسديد" },
      { key: "weak_foot", label: "القدم الضعيفة" },
    ],
  },
  {
    key: "tactical",
    label: "فهم اللعب",
    color: "#eb6834",
    skills: [
      { key: "positioning", label: "التمركز" },
      { key: "decisions", label: "اتخاذ القرار" },
      { key: "teamplay", label: "اللعب الجماعي" },
      { key: "defending", label: "الدفاع واسترجاع الكرة" },
    ],
  },
  {
    key: "physical",
    label: "بدني وحركي",
    color: "#1baf7a",
    skills: [
      { key: "speed", label: "السرعة" },
      { key: "agility", label: "الرشاقة" },
      { key: "coordination", label: "التوازن والتوافق" },
      { key: "endurance", label: "التحمل" },
    ],
  },
  {
    key: "mental",
    label: "ذهني وشخصي",
    color: "#eda100",
    skills: [
      { key: "focus", label: "التركيز والاستماع" },
      { key: "effort", label: "الجهد والحماس" },
      { key: "discipline", label: "الانضباط" },
      { key: "confidence", label: "الثقة بالنفس" },
      { key: "sportsmanship", label: "الروح الرياضية" },
    ],
  },
];
export const pillarOf = (k: Pillar) => PILLARS.find((p) => p.key === k)!;
export const ALL_SKILLS = PILLARS.flatMap((p) => p.skills.map((s) => ({ ...s, pillar: p.key })));

export const SCORE_LABELS = ["", "يحتاج تطوير", "مقبول", "جيد", "جيد جداً", "ممتاز"];

export type Scores = Record<string, number>;
export type Evaluation = { id: string; player_id: string; eval_date: string; scores: Scores; notes: string; created_by: string | null; created_at: string };
export type PlayerTest = { id: string; player_id: string; test_key: string; value: number; test_date: string; created_by: string | null; created_at: string };
export type Goal = { id: string; player_id: string; title: string; pillar: Pillar; status: "active" | "achieved" | "dropped"; target_date: string | null; achieved_at: string | null; created_by: string | null; created_at: string };
export type PlayerNote = { id: string; player_id: string; body: string; created_by: string | null; created_at: string };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function pillarAvg(scores: Scores, pillar: Pillar) {
  return avg(pillarOf(pillar).skills.map((s) => scores[s.key]).filter((v): v is number => typeof v === "number" && v > 0));
}
/** mean of the pillar means (pillars with no scores are skipped) */
export function overall(scores: Scores) {
  return avg(PILLARS.map((p) => pillarAvg(scores, p.key)).filter((v): v is number => v !== null));
}
export const fmt1 = (n: number | null) => (n === null ? "—" : n.toFixed(1));

export const TESTS: { key: string; label: string; unit: string; lowerIsBetter: boolean; hint: string }[] = [
  { key: "sprint_10", label: "سرعة ١٠ متر", unit: "ث", lowerIsBetter: true, hint: "من الوقوف — أقل وقت أفضل" },
  { key: "sprint_20", label: "سرعة ٢٠ متر", unit: "ث", lowerIsBetter: true, hint: "من الوقوف — أقل وقت أفضل" },
  { key: "agility", label: "الرشاقة (سلالوم أقماع)", unit: "ث", lowerIsBetter: true, hint: "بدون كرة" },
  { key: "dribble", label: "المراوغة بالكرة (سلالوم)", unit: "ث", lowerIsBetter: true, hint: "نفس المسار مع الكرة" },
  { key: "juggling", label: "التنطيط", unit: "مرة", lowerIsBetter: false, hint: "أفضل محاولة من ثلاث" },
  { key: "passing", label: "دقة التمرير", unit: "/10", lowerIsBetter: false, hint: "١٠ تمريرات على هدف صغير" },
  { key: "shooting", label: "دقة التسديد", unit: "/10", lowerIsBetter: false, hint: "١٠ تسديدات على المرمى" },
  { key: "balance", label: "التوازن على رجل وحدة", unit: "ث", lowerIsBetter: false, hint: "أطول مدة" },
];
export const testOf = (k: string) => TESTS.find((t) => t.key === k);
