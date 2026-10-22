import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { canEvaluate, getProfile, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PlayerFile from "./player-file";
import type { Evaluation, Goal, PlayerNote, PlayerTest } from "@/lib/development";
import type { PlayerStats } from "@/lib/players";
import type { StaffName } from "@/lib/types";

export const metadata: Metadata = { title: "ملف اللاعب" };

export default async function PlayerFilePage({ params }: PageProps<"/development/[id]">) {
  const me = await getProfile();
  if (!canEvaluate(me)) redirect("/");
  const { id } = await params;
  const supabase = await createClient();
  const { data: player } = await supabase.from("players").select("id, full_name, age, group_id, branch_id, kind, trial_date, created_at").eq("id", id).maybeSingle();
  if (!player) notFound();

  const [group, evals, tests, goals, notes, names, stats] = await Promise.all([
    player.group_id ? supabase.from("groups").select("name").eq("id", player.group_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("player_evaluations").select("*").eq("player_id", id).order("eval_date").order("created_at"),
    supabase.from("player_tests").select("*").eq("player_id", id).order("test_date"),
    supabase.from("player_goals").select("*").eq("player_id", id).order("created_at"),
    supabase.from("player_notes").select("*").eq("player_id", id).order("created_at", { ascending: false }),
    supabase.rpc("staff_names"),
    supabase.from("player_attendance_stats").select("*").eq("player_id", id).maybeSingle(),
  ]);

  return (
    <PlayerFile
      me={{ id: me.id, isOwner: me.role === "owner" }}
      today={todayKW()}
      player={{ ...player, group_name: (group.data as { name: string } | null)?.name ?? null }}
      initialEvals={(evals.data ?? []) as Evaluation[]}
      initialTests={(tests.data ?? []) as PlayerTest[]}
      initialGoals={(goals.data ?? []) as Goal[]}
      initialNotes={(notes.data ?? []) as PlayerNote[]}
      staff={(names.data ?? []) as StaffName[]}
      stats={(stats.data ?? null) as PlayerStats | null}
    />
  );
}
