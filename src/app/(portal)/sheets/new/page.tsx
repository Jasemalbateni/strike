import type { Metadata } from "next";
import { canApproveDrills, getProfile, requireAccess, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import SheetBuilder, { type Drawing } from "@/components/sheets/builder";

export const metadata: Metadata = { title: "إنشاء ورقة تمرين" };

export default async function NewSheetPage(props: PageProps<"/sheets/new">) {
  const sp = await props.searchParams;
  const me = await getProfile();
  requireAccess(me, "drills");
  // opened from the studio: "إنشاء ورقة من هذا الرسم"
  const drawingId = typeof sp.drawing === "string" && /^[0-9a-f-]{36}$/i.test(sp.drawing) ? sp.drawing : null;
  let drawing: Drawing | null = null;
  if (drawingId) {
    const supabase = await createClient();
    const { data } = await supabase.from("drills").select("id, title, board").eq("id", drawingId).maybeSingle();
    drawing = (data as Drawing | null) ?? null;
  }
  return (
    <SheetBuilder
      sheet={null}
      me={{ id: me.id, name: me.full_name, canApprove: canApproveDrills(me), isOwner: me.role === "owner" }}
      today={todayKW()}
      initialKind={sp.kind === "session" ? "session" : "drill"}
      fromDrawing={drawing}
    />
  );
}
