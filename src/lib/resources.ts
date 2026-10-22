export type Block =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image"; path: string; caption: string }
  | { id: string; type: "tip"; text: string; tone: "tip" | "warning" }
  | { id: string; type: "divider" }
  | { id: string; type: "youtube"; url: string };

export type Resource = {
  id: string;
  kind: "article" | "presentation";
  title: string;
  category: string;
  summary: string;
  blocks: Block[];
  pdf_path: string | null;
  pdf_pages: number | null;
  cover_path: string | null;
  pinned: boolean;
  published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ResourceComment = { id: string; resource_id: string; body: string; created_by: string | null; created_at: string };

export const BUCKET = "resources";

export const CATEGORIES: { key: string; label: string }[] = [
  { key: "meetings", label: "اجتماعات" },
  { key: "methodology", label: "منهجية سترايك" },
  { key: "coaching", label: "إدارة الحصة" },
  { key: "tactics", label: "تكتيك ونموذج اللعب" },
  { key: "development", label: "تطوير المدرب" },
  { key: "general", label: "عام" },
];
export const categoryLabel = (k: string) => CATEGORIES.find((c) => c.key === k)?.label ?? "عام";

export const newId = () => Math.random().toString(36).slice(2, 10);

/** every storage path a resource references (for one batch of signed URLs) */
export function pathsOf(r: Pick<Resource, "blocks" | "pdf_path" | "cover_path">) {
  const out = new Set<string>();
  for (const b of r.blocks ?? []) if (b.type === "image" && b.path) out.add(b.path);
  if (r.pdf_path) out.add(r.pdf_path);
  if (r.cover_path) out.add(r.cover_path);
  return [...out];
}

/** youtube watch / share / shorts url → embed url (privacy-enhanced) */
export function youtubeEmbed(url: string) {
  const m = url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

/** minimal, safe inline formatting: **bold** only (rendered as React nodes, never as HTML) */
export function splitBold(line: string): { text: string; bold: boolean }[] {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => (p.startsWith("**") && p.endsWith("**") ? { text: p.slice(2, -2), bold: true } : { text: p, bold: false }));
}

export const readMinutes = (r: Pick<Resource, "blocks" | "pdf_pages">) => {
  const words = (r.blocks ?? []).reduce((t, b) => t + ("text" in b ? b.text.split(/\s+/).length : 0), 0);
  return Math.max(1, Math.round(words / 180 + (r.pdf_pages ?? 0) * 0.5));
};
