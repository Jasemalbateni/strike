import type { Metadata } from "next";
import { canApproveDrills, canManageSessions, getProfile, hasAccess, requireAccess, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Branch, Group } from "@/lib/players";
import TrainingCalendar from "./training-calendar";

export const metadata: Metadata = { title: "التقويم" };

export default async function CalendarPage() {
  const me = await getProfile();
  requireAccess(me, "calendar");
  const supabase = await createClient();
  const [branches, groups] = await Promise.all([
    supabase.from("branches").select("*").eq("is_active", true).order("created_at"),
    supabase.from("groups").select("*").eq("is_active", true).order("position"),
  ]);
  return (
    <TrainingCalendar
      me={{ id: me.id, canApprove: canApproveDrills(me), canManage: canManageSessions(me), canDraw: hasAccess(me, "drills"), canAttendance: hasAccess(me, "attendance") }}
      today={todayKW()}
      branches={(branches.data ?? []) as Branch[]}
      groups={(groups.data ?? []) as Group[]}
    />
  );
}
