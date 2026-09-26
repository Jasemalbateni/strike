import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/page-header";
import TeamManager from "./team-manager";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "الفريق" };

export default async function TeamPage() {
  const me = await getProfile();
  if (me.role !== "owner") redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("created_at");
  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-4xl">
      <PageHeader title="الفريق" subtitle="أنت الوحيد اللي يشوف هذي الصفحة. الأدوار والصلاحيات ما تظهر لأي موظف آخر." />
      <TeamManager initial={(data ?? []) as Profile[]} meId={me.id} />
    </div>
  );
}
