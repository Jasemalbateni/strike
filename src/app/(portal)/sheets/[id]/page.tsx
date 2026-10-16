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
  const me = await getProfile();
  requireAccess(me, "drills");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data }, names] = await Promise.all([supabase.from("drill_sheets").select("*").eq("id", id).maybeSingle(), supabase.rpc("staff_names")]);
  if (!data) notFound();
  const sheet = { ...(data as DrillSheet), drills: normalizeDrills(data.drills) };
  const author = ((names.data ?? []) as StaffName[]).find((s) => s.id === sheet.author_id)?.full_name;
  return <SheetBuilder sheet={sheet} me={{ id: me.id, name: me.full_name, canDelete: canApproveDrills(me) }} authorName={author} today={todayKW()} />;
}
