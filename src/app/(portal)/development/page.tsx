import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canEvaluate, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/page-header";
import DevelopmentList, { type Row } from "./development-list";
import type { Evaluation } from "@/lib/development";
import type { Group } from "@/lib/players";

export const metadata: Metadata = { title: "تطوير اللاعبين" };

export default async function DevelopmentPage() {
  const me = await getProfile();
  if (!canEvaluate(me)) redirect("/");
  const supabase = await createClient();
  const [players, groups, evals, goals] = await Promise.all([
    supabase.from("players").select("id, full_name, age, group_id, kind").eq("archived", false).order("full_name"),
    supabase.from("groups").select("*").eq("is_active", true).order("position"),
    supabase.from("player_evaluations").select("player_id, eval_date, scores").order("eval_date", { ascending: false }),
    supabase.from("player_goals").select("player_id").eq("status", "active"),
  ]);
  const byPlayer = new Map<string, Pick<Evaluation, "eval_date" | "scores">[]>();
  for (const e of (evals.data ?? []) as Pick<Evaluation, "player_id" | "eval_date" | "scores">[]) {
    if (!byPlayer.has(e.player_id)) byPlayer.set(e.player_id, []);
    byPlayer.get(e.player_id)!.push(e);
  }
  const goalCount = new Map<string, number>();
  for (const g of (goals.data ?? []) as { player_id: string }[]) goalCount.set(g.player_id, (goalCount.get(g.player_id) ?? 0) + 1);

  const rows: Row[] = ((players.data ?? []) as Omit<Row, "latest" | "previous" | "evalCount" | "activeGoals">[]).map((p) => {
    const list = byPlayer.get(p.id) ?? [];
    return { ...p, latest: list[0] ?? null, previous: list[1] ?? null, evalCount: list.length, activeGoals: goalCount.get(p.id) ?? 0 };
  });

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl">
      <PageHeader title="تطوير اللاعبين" subtitle="ملف كل لاعب: التقييمات، الاختبارات، الأهداف والملاحظات" />
      <DevelopmentList rows={rows} groups={(groups.data ?? []) as Group[]} />
    </div>
  );
}
