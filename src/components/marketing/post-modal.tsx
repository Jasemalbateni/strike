"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { useHub } from "./store";
import { Field, Modal, PlatformSelect } from "@/components/ui";
import { FORMATS, STATUSES, type Platform, type Post, type PostFormat, type PostStatus } from "@/lib/types";

export type PostDraft = Partial<Post> & { idea_id?: string | null };

export default function PostModal({ draft, onClose }: { draft: PostDraft | null; onClose: (saved?: Post | null) => void }) {
  return (
    <Modal open={!!draft} onClose={() => onClose()} title={draft?.id ? "تعديل المنشور" : "منشور جديد"} wide>
      {draft && <PostForm key={draft.id ?? "new"} draft={draft} onClose={onClose} />}
    </Modal>
  );
}

function PostForm({ draft, onClose }: { draft: PostDraft; onClose: (saved?: Post | null) => void }) {
  const { data, insert, update, remove } = useHub();
  const [p, setP] = useState<PostDraft>(draft);
  const [busy, setBusy] = useState(false);

  const campaigns = data.plan.filter((x) => x.kind === "campaign");

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const values = {
      title: p.title?.trim() || "منشور",
      platform: (p.platform ?? "instagram") as Platform,
      format: (p.format ?? "reel") as PostFormat,
      status: (p.status ?? "idea") as PostStatus,
      scheduled_date: p.scheduled_date || null,
      scheduled_time: p.scheduled_time || null,
      assignee_id: p.assignee_id || null,
      campaign_id: p.campaign_id || null,
      caption: p.caption ?? "",
      hashtags: p.hashtags ?? "",
      media_url: p.media_url ?? "",
      notes: p.notes ?? "",
    };
    let saved: Post | null = null;
    if (p.id) {
      await update("posts", p.id, values);
      saved = { ...(data.posts.find((x) => x.id === p.id) as Post), ...values };
    } else {
      saved = await insert<Post>("posts", { ...values, idea_id: p.idea_id ?? null, position: data.posts.length });
      if (saved && p.idea_id) await update("ideas", p.idea_id, { moved_post_id: saved.id });
    }
    setBusy(false);
    onClose(saved);
  }

  async function del() {
    if (!p.id || !confirm("حذف المنشور نهائياً؟")) return;
    await remove("posts", p.id);
    onClose(null);
  }

  return (
    <form id="post-form" onSubmit={save} className="grid gap-4 sm:grid-cols-3 pb-1">
        <Field label="العنوان" className="sm:col-span-3">
          <input className="field" autoFocus value={p.title ?? ""} onChange={(e) => setP({ ...p, title: e.target.value })} placeholder="مثال: Reel — أول لمسة للطفل في التمرين" required />
        </Field>
        <Field label="المنصة">
          <PlatformSelect value={(p.platform ?? "instagram") as Platform} onChange={(platform) => setP({ ...p, platform })} includeGeneral={false} />
        </Field>
        <Field label="النوع">
          <select className="field" value={p.format ?? "reel"} onChange={(e) => setP({ ...p, format: e.target.value as PostFormat })}>
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الحالة">
          <select className="field" value={p.status ?? "idea"} onChange={(e) => setP({ ...p, status: e.target.value as PostStatus })}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="التاريخ">
          <input className="field num" dir="ltr" type="date" value={p.scheduled_date ?? ""} onChange={(e) => setP({ ...p, scheduled_date: e.target.value || null })} />
        </Field>
        <Field label="الوقت">
          <input className="field num" dir="ltr" type="time" value={p.scheduled_time?.slice(0, 5) ?? ""} onChange={(e) => setP({ ...p, scheduled_time: e.target.value || null })} />
        </Field>
        <Field label="المسؤول">
          <select className="field" value={p.assignee_id ?? ""} onChange={(e) => setP({ ...p, assignee_id: e.target.value || null })}>
            <option value="">—</option>
            {data.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الحملة" className="sm:col-span-3">
          <select className="field" value={p.campaign_id ?? ""} onChange={(e) => setP({ ...p, campaign_id: e.target.value || null })}>
            <option value="">بدون حملة</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الكابشن" className="sm:col-span-3">
          <textarea className="field min-h-28" value={p.caption ?? ""} onChange={(e) => setP({ ...p, caption: e.target.value })} placeholder="النص اللي بينزل مع المنشور…" />
        </Field>
        <Field label="الهاشتاقات" className="sm:col-span-2">
          <input className="field en" dir="ltr" value={p.hashtags ?? ""} onChange={(e) => setP({ ...p, hashtags: e.target.value })} placeholder="#strike #الكويت #أكاديمية_كرة_قدم" />
        </Field>
        <Field label="رابط الميديا">
          <input className="field en" dir="ltr" type="url" value={p.media_url ?? ""} onChange={(e) => setP({ ...p, media_url: e.target.value })} placeholder="Drive / Higgsfield…" />
        </Field>
        <Field label="ملاحظات داخلية" className="sm:col-span-3">
          <textarea className="field min-h-16" value={p.notes ?? ""} onChange={(e) => setP({ ...p, notes: e.target.value })} />
        </Field>
        <div className="sm:col-span-3 flex items-center justify-between gap-3 pt-2 border-t border-silver-200">
          <div>
            {p.id && (
              <button type="button" className="btn-danger h-9 px-3 text-sm" onClick={del}>
                <Trash2 size={15} /> حذف
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => onClose()}>
              إلغاء
            </button>
            <button className="btn-primary" disabled={busy}>
              حفظ
            </button>
          </div>
        </div>
      </form>
  );
}
