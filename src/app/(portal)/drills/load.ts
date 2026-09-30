import { canApproveDrills, hasAccess, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, StaffName } from "@/lib/types";
import type { Branch, Group } from "@/lib/players";
import type { StudioMe } from "@/components/drills/studio";

/** shared data for the drill studio pages */
export async function studioContext(me: Profile) {
  const supabase = await createClient();
  const [names, branches, groups] = await Promise.all([
    supabase.rpc("staff_names"),
    supabase.from("branches").select("*").eq("is_active", true).order("created_at"),
    supabase.from("groups").select("*").eq("is_active", true).order("position"),
  ]);
  const staff = (names.data ?? []) as StaffName[];
  const studioMe: StudioMe = {
    id: me.id,
    name: me.full_name,
    isOwner: me.role === "owner",
    canDraw: hasAccess(me, "drills"),
    canApprove: canApproveDrills(me),
    canCalendar: hasAccess(me, "calendar"),
  };
  return {
    supabase,
    staff,
    nameOf: (id: string | null) => staff.find((s) => s.id === id)?.full_name,
    me: studioMe,
    branches: (branches.data ?? []) as Branch[],
    groups: (groups.data ?? []) as Group[],
    today: todayKW(),
  };
}
