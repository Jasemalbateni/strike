import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import PageHeader from "@/components/page-header";
import AnalyticsBoard, { type Data } from "./analytics-board";

export const metadata: Metadata = { title: "التحليلات" };

export default async function AnalyticsPage() {
  const me = await getProfile();
  if (me.role !== "owner") redirect("/");
  const supabase = await createClient();

  const [players, subs, sessions, attendance, groups, sheets, evals, notes, notifs, staff, metrics] = await Promise.all([
    fetchAll<Data["players"][number]>((a, b) => supabase.from("players").select("id, full_name, group_id, branch_id, kind, source, trial_date, converted_at, archived, created_at").order("id").range(a, b)),
    fetchAll<Data["subs"][number]>((a, b) => supabase.from("subscriptions").select("id, player_id, start_date, end_date, amount, paid, paid_at").order("id").range(a, b)),
    fetchAll<Data["sessions"][number]>((a, b) => supabase.from("sessions").select("id, branch_id, session_date, cancelled").order("id").range(a, b)),
    fetchAll<Data["attendance"][number]>((a, b) => supabase.from("attendance").select("session_id, player_id, status").order("id").range(a, b)),
    supabase.from("groups").select("id, name, branch_id, position").eq("is_active", true).order("position"),
    fetchAll<Data["sheets"][number]>((a, b) => supabase.from("drill_sheets").select("author_id, status, submitted_at, created_at").order("id").range(a, b)),
    fetchAll<Data["evals"][number]>((a, b) => supabase.from("player_evaluations").select("player_id, eval_date, scores, created_by").order("id").range(a, b)),
    fetchAll<Data["notes"][number]>((a, b) => supabase.from("player_notes").select("created_by, created_at").order("id").range(a, b)),
    fetchAll<Data["notifs"][number]>((a, b) => supabase.from("notifications").select("recipient_id, kind, created_at").order("id").range(a, b)),
    supabase.from("profiles").select("id, full_name, role, is_active").order("created_at"),
    supabase.from("mk_metrics").select("week_start, trials, registrations, views, platform").order("week_start"),
  ]);

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl">
      <PageHeader title="التحليلات" subtitle="صورة الأكاديمية بالأرقام — تشوفها أنت بس" />
      <AnalyticsBoard
        today={todayKW()}
        data={{
          players,
          subs,
          sessions,
          attendance,
          groups: (groups.data ?? []) as Data["groups"],
          sheets,
          evals,
          notes,
          notifs,
          staff: (staff.data ?? []) as Data["staff"],
          metrics: (metrics.data ?? []) as Data["metrics"],
        }}
      />
    </div>
  );
}
