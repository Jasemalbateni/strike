import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getProfile, hasAccess } from "@/lib/auth";
import DrillStudio from "@/components/drills/studio";
import type { Drill } from "@/lib/drills/meta";
import { studioContext } from "../load";

export const metadata: Metadata = { title: "تمرين" };

export default async function DrillPage(props: PageProps<"/drills/[id]">) {
  const { id } = await props.params;
  const me = await getProfile();
  // coaches draw; calendar users (e.g. admins) may open drills planned in the calendar
  if (!hasAccess(me, "drills") && !hasAccess(me, "calendar")) redirect("/");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await studioContext(me);
  const { data } = await ctx.supabase.from("drills").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const drill = data as Drill;
  return (
    <DrillStudio
      drill={drill}
      me={ctx.me}
      authorName={ctx.nameOf(drill.author_id)}
      reviewerName={ctx.nameOf(drill.reviewed_by)}
      branches={ctx.branches}
      groups={ctx.groups}
      today={ctx.today}
    />
  );
}
