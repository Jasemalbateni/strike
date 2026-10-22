import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/page-header";
import ResourcesList, { type Card } from "./resources-list";
import { BUCKET, type Block, type Resource } from "@/lib/resources";

export const metadata: Metadata = { title: "المصادر التعليمية" };

export default async function ResourcesPage() {
  const me = await getProfile();
  const isOwner = me.role === "owner";
  const supabase = await createClient();
  const [res, comments, reads] = await Promise.all([
    supabase.from("resources").select("id, kind, title, category, summary, blocks, pdf_pages, cover_path, pinned, published, created_at").order("pinned", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("resource_comments").select("resource_id"),
    supabase.from("resource_reads").select("resource_id").eq("user_id", me.id),
  ]);
  const rows = (res.data ?? []) as (Pick<Resource, "id" | "kind" | "title" | "category" | "summary" | "blocks" | "pdf_pages" | "cover_path" | "pinned" | "published" | "created_at">)[];

  // cover: explicit cover, else the first image in the thread
  const coverOf = (r: (typeof rows)[number]) => r.cover_path ?? (r.blocks ?? []).find((b): b is Extract<Block, { type: "image" }> => b.type === "image")?.path ?? null;
  const paths = rows.map(coverOf).filter((p): p is string => !!p);
  const signed = paths.length ? await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6) : { data: [] };
  const urlOf = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));

  const commentCount = new Map<string, number>();
  for (const c of (comments.data ?? []) as { resource_id: string }[]) commentCount.set(c.resource_id, (commentCount.get(c.resource_id) ?? 0) + 1);
  const readSet = new Set(((reads.data ?? []) as { resource_id: string }[]).map((r) => r.resource_id));

  const cards: Card[] = rows.map((r) => {
    const cp = coverOf(r);
    const words = (r.blocks ?? []).reduce((t, b) => t + ("text" in b ? String(b.text).split(/\s+/).length : 0), 0);
    return {
      id: r.id,
      kind: r.kind,
      title: r.title,
      category: r.category,
      summary: r.summary,
      pinned: r.pinned,
      published: r.published,
      created_at: r.created_at,
      cover: cp ? (urlOf.get(cp) ?? null) : null,
      pages: r.pdf_pages,
      minutes: Math.max(1, Math.round(words / 180 + (r.pdf_pages ?? 0) * 0.5)),
      comments: commentCount.get(r.id) ?? 0,
      unread: !readSet.has(r.id),
    };
  });

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl">
      <PageHeader title="المصادر التعليمية" subtitle="برزنتيشن الاجتماعات ومواضيع تطوّر المدرب — اقرأ وشارك رأيك تحت كل موضوع" />
      <ResourcesList cards={cards} isOwner={isOwner} />
    </div>
  );
}
