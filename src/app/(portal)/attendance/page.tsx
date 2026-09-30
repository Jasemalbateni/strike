import type { Metadata } from "next";
import { canManagePlayers, canManageSessions, getProfile, requireAccess, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AttendanceBoard from "./attendance-board";
import type { Attendance, Branch, Group, Player, Session, Subscription } from "@/lib/players";

export const metadata: Metadata = { title: "الحضور" };

export default async function AttendancePage() {
  const me = await getProfile();
  requireAccess(me, "attendance");
  const supabase = await createClient();
  const canManage = canManagePlayers(me);

  const [branches, groups, players, sessions, subs] = await Promise.all([
    supabase.from("branches").select("*").eq("is_active", true).order("created_at"),
    supabase.from("groups").select("*").eq("is_active", true).order("position"),
    supabase.from("players").select("*").eq("archived", false).order("full_name"),
    supabase.from("sessions").select("*").order("session_date", { ascending: false }).limit(120),
    canManage ? supabase.from("subscriptions").select("*").order("end_date", { ascending: false }) : Promise.resolve({ data: [] as Subscription[] }),
  ]);

  // attendance for the recent sessions (the board loads older ones on demand)
  const sessionIds = (sessions.data ?? []).map((s) => s.id);
  const attendance = sessionIds.length ? await supabase.from("attendance").select("*").in("session_id", sessionIds) : { data: [] as Attendance[] };

  // coaches don't get guardian data
  const playersSafe = ((players.data ?? []) as Player[]).map((p) => (canManage ? p : { ...p, guardian_name: "", guardian_phone: "" }));

  return (
    <AttendanceBoard
      me={{ id: me.id, name: me.full_name, canManage, canCancel: canManageSessions(me) }}
      today={todayKW()}
      branches={(branches.data ?? []) as Branch[]}
      groups={(groups.data ?? []) as Group[]}
      initialPlayers={playersSafe}
      initialSessions={(sessions.data ?? []) as Session[]}
      initialAttendance={(attendance.data ?? []) as Attendance[]}
      subscriptions={(subs.data ?? []) as Subscription[]}
    />
  );
}
