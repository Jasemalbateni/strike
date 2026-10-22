import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/page-header";
import TeamManager from "./team-manager";
import ActivityPanel, { type DayRow, type Person } from "./activity-panel";
import { addDays, format, parseISO } from "date-fns";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "الفريق" };

export default async function TeamPage() {
  const me = await getProfile();
  if (me.role !== "owner") redirect("/");
  const supabase = await createClient();
  const today = todayKW();
  const since = format(addDays(parseISO(today), -45), "yyyy-MM-dd");
  const [{ data }, activity, signIns] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("staff_activity_days").select("*").gte("day", since),
    supabase.rpc("staff_sign_ins"),
  ]);
  const people = ((data ?? []) as Profile[]).filter((p) => p.id !== me.id);
  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-4xl">
      <PageHeader title="الفريق" subtitle="أنت الوحيد اللي يشوف هذي الصفحة. الأدوار والصلاحيات ما تظهر لأي موظف آخر." />
      <ActivityPanel
        today={today}
        people={people as Person[]}
        days={(activity.data ?? []) as DayRow[]}
        signIns={Object.fromEntries(((signIns.data ?? []) as { id: string; last_sign_in_at: string | null }[]).map((s) => [s.id, s.last_sign_in_at]))}
      />
      <TeamManager initial={(data ?? []) as Profile[]} meId={me.id} />
    </div>
  );
}
