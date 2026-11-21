import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { canEvaluate, getProfile, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PlayerFile from "./player-file";
import type { Evaluation, Goal, PlayerNote, PlayerTest } from "@/lib/development";
import type { PlayerStats } from "@/lib/players";
import type { StaffName } from "@/lib/types";
import { buildContent, type DatedSheet, type Mark, type PlanRow } from "@/lib/content";
import type { AttendanceStatus, Squad } from "@/lib/players";

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

  // what he was given: his attendance marks joined with the content of those days
  const att = await supabase.from("attendance").select("status, squad, sessions!inner(session_date, cancelled)").eq("player_id", id);
  type AttRow = { status: AttendanceStatus; squad: Squad | null; sessions: { session_date: string; cancelled: boolean } | { session_date: string; cancelled: boolean }[] };
  const marks: Mark[] = ((att.data ?? []) as unknown as AttRow[])
    .map((r) => ({ status: r.status, squad: r.squad ?? null, s: Array.isArray(r.sessions) ? r.sessions[0] : r.sessions }))
    .filter((r) => r.s && !r.s.cancelled)
    .map((r) => ({ date: r.s.session_date, status: r.status, squad: r.squad }));
  const dates = [...new Set(marks.map((m) => m.date))];
  const [planRes, sheetRes] = dates.length
    ? await Promise.all([
        supabase.from("plan_items").select("item_date, group_id, squad, sheet_index, drill_sheets(drills)").eq("kind", "drill").not("sheet_id", "is", null).in("item_date", dates),
        supabase.from("drill_sheets").select("session_date, drills").eq("status", "approved").in("session_date", dates),
      ])
    : [{ data: [] }, { data: [] }];
  type PlanRes = { item_date: string; group_id: string | null; squad: Squad | null; sheet_index: number | null; drill_sheets: { drills: unknown } | { drills: unknown }[] | null };
  const plan: PlanRow[] = ((planRes.data ?? []) as unknown as PlanRes[]).map((r) => ({
    item_date: r.item_date,
    group_id: r.group_id,
    squad: r.squad ?? null,
    sheet_index: r.sheet_index,
    drills: (Array.isArray(r.drill_sheets) ? r.drill_sheets[0] : r.drill_sheets)?.drills ?? [],
  }));
  const content = buildContent({ marks, plan, sheets: (sheetRes.data ?? []) as DatedSheet[], groupId: player.group_id, evals: (evals.data ?? []) as Evaluation[] });

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
      content={content}
    />
  );
}
