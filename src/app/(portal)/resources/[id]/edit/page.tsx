import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ResourceEditor from "@/components/resources/editor";
import { BUCKET, pathsOf, type Resource } from "@/lib/resources";

export const metadata: Metadata = { title: "تعديل" };

export default async function EditResourcePage({ params }: PageProps<"/resources/[id]/edit">) {
  const me = await getProfile();
  if (me.role !== "owner") redirect("/resources");
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("resources").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as Resource;
  const paths = pathsOf(r);
  const signed = paths.length ? await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6) : { data: [] };
  const urls = Object.fromEntries(((signed.data ?? []) as { path: string | null; signedUrl: string }[]).filter((s) => s.path).map((s) => [s.path!, s.signedUrl]));
  return <ResourceEditor existing={r} initialUrls={urls} />;
}
