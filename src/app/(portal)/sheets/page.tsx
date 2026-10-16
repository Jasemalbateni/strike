import type { Metadata } from "next";
import { canApproveDrills, getProfile, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { StaffName } from "@/lib/types";
import type { DrillSheet } from "@/lib/sheets";
import SheetList from "./list";

export const metadata: Metadata = { title: "أوراق التمارين" };

export default async function SheetsPage() {
  const me = await getProfile();
  requireAccess(me, "drills");
  const supabase = await createClient();
  const [sheets, names] = await Promise.all([
    supabase.from("drill_sheets").select("id, kind, title, session_date, age_group, drills, author_id, created_at, updated_at").order("updated_at", { ascending: false }).limit(400),
    supabase.rpc("staff_names"),
  ]);
  return <SheetList me={{ id: me.id, canDelete: canApproveDrills(me) }} initialSheets={(sheets.data ?? []) as DrillSheet[]} staff={(names.data ?? []) as StaffName[]} />;
}
