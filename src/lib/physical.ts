/* الأهداف البدنية لورقة التمرين — نفس تصنيف «المختبر الحركي» في المصادر:
 * ثلاث عائلات للمهارات الحركية الأساسية + الصفات البدنية السبع.
 * (التوازن جزء من «مهارات الثبات».) */

export type PhysicalKey = "locomotor" | "stability" | "object" | "coordination" | "strength" | "speed" | "agility" | "power" | "mobility" | "endurance";

export const PHYSICAL: { key: PhysicalKey; label: string; hint: string; family: "fms" | "quality"; /** matching skill in the player evaluation, if any */ skill?: string }[] = [
  { key: "locomotor", label: "المهارات الانتقالية", hint: "جري، قفز، حجل، وثب", family: "fms" },
  { key: "stability", label: "مهارات الثبات", hint: "توازن، هبوط، كبح، قرفصاء", family: "fms", skill: "coordination" },
  { key: "object", label: "التحكم بالأدوات", hint: "رمي، لقف، ركل، تنطيط", family: "fms" },
  { key: "coordination", label: "التوافق", hint: "عين–قدم، إيقاع، تعاكس الأطراف", family: "quality", skill: "coordination" },
  { key: "strength", label: "القوة", hint: "وزن الجسم: دب، سلطعون، تعلّق", family: "quality" },
  { key: "speed", label: "السرعة", hint: "انطلاق وتسارع لمسافات قصيرة", family: "quality", skill: "speed" },
  { key: "agility", label: "الرشاقة", hint: "كبح وتغيير اتجاه", family: "quality", skill: "agility" },
  { key: "power", label: "القدرة", hint: "وثب وارتداد انفجاري", family: "quality" },
  { key: "mobility", label: "المرونة الحركية", hint: "مدى الحركة: قرفصاء عميقة، خطوة العملاق", family: "quality" },
  { key: "endurance", label: "التحمّل", hint: "لعب متواصل بفترات راحة قصيرة", family: "quality", skill: "endurance" },
];

const KEYS = new Set<string>(PHYSICAL.map((p) => p.key));
export const isPhysical = (k: unknown): k is PhysicalKey => typeof k === "string" && KEYS.has(k);
export const physicalLabel = (k: string) => PHYSICAL.find((p) => p.key === k)?.label ?? k;

/** stored values → a clean (main, secondary[]) pair: unknown keys dropped, the main never repeated as secondary */
export function cleanPhysical(main: unknown, extra: unknown): { phys: PhysicalKey | ""; phys2: PhysicalKey[] } {
  const phys = isPhysical(main) ? main : "";
  const phys2 = Array.isArray(extra) ? [...new Set(extra.filter(isPhysical))].filter((k) => k !== phys) : [];
  return { phys, phys2 };
}

/** "الرشاقة + التوافق" — the main goal first */
export function physicalLine(main: unknown, extra: unknown) {
  const { phys, phys2 } = cleanPhysical(main, extra);
  return [phys, ...phys2].filter(Boolean).map(physicalLabel).join(" + ");
}
