import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ResourceView from "./resource-view";
import { BUCKET, pathsOf, type Resource, type ResourceComment } from "@/lib/resources";
import type { StaffName } from "@/lib/types";

export const metadata: Metadata = { title: "المصادر التعليمية" };

export default async function ResourcePage({ params }: PageProps<"/resources/[id]">) {
  const me = await getProfile();
  const isOwner = me.role === "owner";
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("resources").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as Resource;

  const paths = pathsOf(r);
  const [signed, comments, names, reads, staff] = await Promise.all([
    paths.length ? supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6) : Promise.resolve({ data: [] }),
    supabase.from("resource_comments").select("*").eq("resource_id", id).order("created_at"),
    supabase.rpc("staff_names"),
    isOwner ? supabase.from("resource_reads").select("user_id, read_at").eq("resource_id", id) : Promise.resolve({ data: [] }),
    isOwner ? supabase.from("profiles").select("id, full_name").eq("is_active", true) : Promise.resolve({ data: [] }),
  ]);
  const urls = Object.fromEntries(((signed.data ?? []) as { path: string | null; signedUrl: string }[]).filter((s) => s.path).map((s) => [s.path!, s.signedUrl]));

  return (
    <ResourceView
      me={{ id: me.id, isOwner }}
      resource={r}
      urls={urls}
      initialComments={(comments.data ?? []) as ResourceComment[]}
      names={(names.data ?? []) as StaffName[]}
      reads={(reads.data ?? []) as { user_id: string; read_at: string }[]}
      staff={((staff.data ?? []) as { id: string; full_name: string }[]).filter((s) => s.id !== me.id)}
    />
  );
}
