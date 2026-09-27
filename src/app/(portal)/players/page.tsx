import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canManagePlayers, getProfile, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PlayersManager from "./players-manager";
import type { Branch, Group, Player, PlayerStats, Subscription } from "@/lib/players";

export const metadata: Metadata = { title: "اللاعبين" };

export default async function PlayersPage() {
  const me = await getProfile();
  if (!canManagePlayers(me)) redirect("/attendance");
  const supabase = await createClient();

  const [branches, groups, players, subs, stats] = await Promise.all([
    supabase.from("branches").select("*").order("created_at"),
    supabase.from("groups").select("*").eq("is_active", true).order("position"),
    supabase.from("players").select("*").order("full_name"),
    supabase.from("subscriptions").select("*").order("end_date", { ascending: false }),
    supabase.from("player_attendance_stats").select("*"),
  ]);

  return (
    <PlayersManager
      me={{ id: me.id, isOwner: me.role === "owner" }}
      today={todayKW()}
      branches={(branches.data ?? []) as Branch[]}
      groups={(groups.data ?? []) as Group[]}
      initialPlayers={(players.data ?? []) as Player[]}
      initialSubs={(subs.data ?? []) as Subscription[]}
      stats={(stats.data ?? []) as PlayerStats[]}
    />
  );
}
