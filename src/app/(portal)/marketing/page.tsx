import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile, canAccessMarketing } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import MarketingHub from "@/components/marketing/hub";
import type { Activity, Comment, Goal, Idea, MetricRow, Note, PlanItem, Post, StaffName } from "@/lib/types";

export const metadata: Metadata = { title: "مركز التسويق" };

export default async function MarketingPage() {
  const me = await getProfile();
  if (!canAccessMarketing(me)) redirect("/");
  const supabase = await createClient();

  const [goals, plan, ideas, posts, metrics, activity, comments, notes, staff] = await Promise.all([
    supabase.from("mk_goals").select("*").order("position").order("created_at"),
    supabase.from("mk_plan_items").select("*").order("position").order("created_at"),
    supabase.from("mk_ideas").select("*").eq("archived", false).order("position").order("created_at", { ascending: false }),
    supabase.from("mk_posts").select("*").order("position").order("created_at"),
    supabase.from("mk_metrics").select("*").order("week_start", { ascending: false }).limit(200),
    supabase.from("mk_activity").select("*").order("created_at", { ascending: false }).limit(40),
    supabase.from("mk_comments").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase.from("mk_notes").select("*").eq("archived", false).order("updated_at", { ascending: false }),
    supabase.rpc("staff_names"),
  ]);

  return (
    <MarketingHub
      me={{ id: me.id, name: me.full_name, isOwner: me.role === "owner", mentionsSeenAt: me.mentions_seen_at ?? new Date(0).toISOString() }}
      initial={{
        goals: (goals.data ?? []) as Goal[],
        plan: (plan.data ?? []) as PlanItem[],
        ideas: (ideas.data ?? []) as Idea[],
        posts: (posts.data ?? []) as Post[],
        metrics: (metrics.data ?? []) as MetricRow[],
        activity: (activity.data ?? []) as Activity[],
        comments: (comments.data ?? []) as Comment[],
        notes: (notes.data ?? []) as Note[],
        staff: (staff.data ?? []) as StaffName[],
      }}
    />
  );
}
