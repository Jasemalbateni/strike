import type { Metadata } from "next";
import { getProfile, requireAccess } from "@/lib/auth";
import DrillStudio from "@/components/drills/studio";
import type { Drill } from "@/lib/drills/meta";
import { studioContext } from "../load";

export const metadata: Metadata = { title: "تمرين جديد" };

export default async function NewDrillPage(props: PageProps<"/drills/new">) {
  const sp = await props.searchParams;
  const from = typeof sp.from === "string" && /^[0-9a-f-]{36}$/i.test(sp.from) ? sp.from : null;
  const me = await getProfile();
  requireAccess(me, "drills");
  const ctx = await studioContext(me);
  const source = from ? ((await ctx.supabase.from("drills").select("*").eq("id", from).maybeSingle()).data as Drill | null) : null;
  return <DrillStudio drill={null} source={source} me={ctx.me} branches={ctx.branches} groups={ctx.groups} today={ctx.today} />;
}
