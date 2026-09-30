import type { Metadata } from "next";
import { canApproveDrills, getProfile, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { StaffName } from "@/lib/types";
import type { Drill } from "@/lib/drills/meta";
import DrillLibrary from "./library";

export const metadata: Metadata = { title: "التمارين" };

export default async function DrillsPage(props: PageProps<"/drills">) {
  const me = await getProfile();
  requireAccess(me, "drills");
  const sp = await props.searchParams;
  const supabase = await createClient();
  const [drills, names] = await Promise.all([
    supabase.from("drills").select("id, title, category, age_group, duration_min, players, status, review_note, author_id, board, updated_at, created_at, submitted_at").order("updated_at", { ascending: false }).limit(400),
    supabase.rpc("staff_names"),
  ]);
  return (
    <DrillLibrary
      me={{ id: me.id, canApprove: canApproveDrills(me) }}
      initialDrills={(drills.data ?? []) as Drill[]}
      staff={(names.data ?? []) as StaffName[]}
      initialTab={typeof sp.tab === "string" ? sp.tab : undefined}
    />
  );
}
