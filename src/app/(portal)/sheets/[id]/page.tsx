import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canApproveDrills, getProfile, requireAccess, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { StaffName } from "@/lib/types";
import { normalizeDrills, type DrillSheet } from "@/lib/sheets";
import SheetBuilder from "@/components/sheets/builder";

export const metadata: Metadata = { title: "ورقة تمرين" };

export default async function SheetPage(props: PageProps<"/sheets/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const me = await getProfile();
  requireAccess(me, "drills");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data }, names] = await Promise.all([supabase.from("drill_sheets").select("*").eq("id", id).maybeSingle(), supabase.rpc("staff_names")]);
  if (!data) notFound();
  const sheet = { ...(data as DrillSheet), drills: normalizeDrills(data.drills) };
  const staff = (names.data ?? []) as StaffName[];
  const nameOf = (uid: string | null) => staff.find((s) => s.id === uid)?.full_name;
  const d = typeof sp.d === "string" ? parseInt(sp.d, 10) : 0;
  return (
    <SheetBuilder
      sheet={sheet}
      me={{ id: me.id, name: me.full_name, canApprove: canApproveDrills(me), isOwner: me.role === "owner" }}
      authorName={nameOf(sheet.author_id)}
      reviewerName={nameOf(sheet.reviewed_by)}
      today={todayKW()}
      initialActive={Number.isFinite(d) ? d : 0}
      initialView={sp.view === "1"}
    />
  );
}
