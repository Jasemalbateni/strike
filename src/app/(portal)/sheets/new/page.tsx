import type { Metadata } from "next";
import { canApproveDrills, getProfile, requireAccess, todayKW } from "@/lib/auth";
import SheetBuilder from "@/components/sheets/builder";

export const metadata: Metadata = { title: "إنشاء ورقة تمرين" };

export default async function NewSheetPage(props: PageProps<"/sheets/new">) {
  const sp = await props.searchParams;
  const me = await getProfile();
  requireAccess(me, "drills");
  return <SheetBuilder sheet={null} me={{ id: me.id, name: me.full_name, canDelete: canApproveDrills(me) }} today={todayKW()} initialKind={sp.kind === "session" ? "session" : "drill"} />;
}
