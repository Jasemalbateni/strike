"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Trash2, CheckCircle2, Undo2, ExternalLink } from "lucide-react";
import { useHub } from "./store";
import { useConfirm } from "@/components/confirm";
import Comments from "./comments";

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

type Values = Pick<Post, "title" | "platform" | "format" | "status" | "scheduled_date" | "scheduled_time" | "assignee_id" | "campaign_id" | "caption" | "hashtags" | "media_url" | "notes">;

function normalize(p: PostDraft): Values {
  return {
    title: p.title?.trim() || "منشور",
    platform: (p.platform ?? "instagram") as Platform,
    format: (p.format ?? "reel") as PostFormat,
    status: (p.status ?? "idea") as PostStatus,
    scheduled_date: p.scheduled_date || null,
    scheduled_time: p.scheduled_time ? p.scheduled_time.slice(0, 5) : null,
    assignee_id: p.assignee_id || null,
    campaign_id: p.campaign_id || null,
    caption: p.caption ?? "",
    hashtags: p.hashtags ?? "",
    media_url: (p.media_url ?? "").trim(),
    notes: p.notes ?? "",
  };
}

function PostForm({ draft, onClose }: { draft: PostDraft; onClose: (saved?: Post | null) => void }) {
  const { data, insert, update, remove, me, refresh } = useHub();
  const confirm = useConfirm();
  const [p, setP] = useState<PostDraft>(draft);
  const [busy, setBusy] = useState(false);

  // the assignee list can change (new staff, deactivated accounts) — refresh it when the form opens
  useEffect(() => {
    refresh("staff");
  }, [refresh]);

  const campaigns = data.plan.filter((x) => x.kind === "campaign");
  // the live row (may have been changed by someone else while this form is open)
  const live = p.id ? data.posts.find((x) => x.id === p.id) : undefined;

  async function persist(next: Values) {
    setBusy(true);
    let saved: Post | null = null;
    if (p.id) {
      // send only what this form changed, so a colleague's concurrent edits are not overwritten
      const base = normalize(draft);
      const diff: Partial<Values> = {};
      (Object.keys(next) as (keyof Values)[]).forEach((k) => {
        if (next[k] !== base[k]) (diff as Record<string, unknown>)[k] = next[k];
      });
      const ok = Object.keys(diff).length === 0 ? true : await update("posts", p.id, diff);
      if (!ok) {
        setBusy(false);
        return;
      }
      saved = { ...(live as Post), ...diff };
    } else {
      saved = await insert<Post>("posts", { ...next, idea_id: p.idea_id ?? null, position: data.posts.length });
      if (!saved) {
        setBusy(false);
        return; // keep the form open so nothing is lost
      }
      if (p.idea_id) await update("ideas", p.idea_id, { moved_post_id: saved.id });
    }
    setBusy(false);
    onClose(saved);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    await persist(normalize(p));
  }

  async function del() {
    if (!p.id) return;
    if (!(await confirm({ title: "حذف المنشور نهائياً؟", message: `«${p.title}» وكل تعليقاته بتنحذف.` }))) return;
    const ok = await remove("posts", p.id);
    if (ok) onClose(null);
  }

  const status = (p.status ?? "idea") as PostStatus;
  const canDecide = me.isOwner && p.id && status === "review";

  return (
    <form id="post-form" onSubmit={save} className="grid gap-4 sm:grid-cols-3 pb-1">
      {canDecide && (
        <div className="sm:col-span-3 rounded-xl bg-gold-100 px-3.5 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-navy-900 text-sm font-bold flex-1">بانتظار اعتمادك — أضف ملاحظاتك في «ملاحظات داخلية» إذا رجّعته.</span>
          <button type="button" className="btn-primary h-9 px-3 text-sm" onClick={() => persist({ ...normalize(p), status: p.scheduled_date ? "scheduled" : "approved" })}>
            <CheckCircle2 size={15} /> اعتماد
          </button>
          <button type="button" className="btn-outline h-9 px-3 text-sm" onClick={() => persist({ ...normalize(p), status: "draft" })}>
            <Undo2 size={15} /> إرجاع للمسودة
          </button>
        </div>
      )}
      <Field label="العنوان" className="sm:col-span-3">
        <input className="field" autoFocus={!p.id} value={p.title ?? ""} onChange={(e) => setP({ ...p, title: e.target.value })} placeholder="مثال: Reel — أول لمسة للطفل في التمرين" required />
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
        <select className="field" value={status} onChange={(e) => setP({ ...p, status: e.target.value as PostStatus })}>
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
        <input className="field" dir="auto" value={p.hashtags ?? ""} onChange={(e) => setP({ ...p, hashtags: e.target.value })} placeholder="#strike #الكويت #أكاديمية_كرة_قدم" />
      </Field>
      <Field label="رابط الميديا">
        <div className="relative">
          <input className="field en pe-10" dir="ltr" type="text" inputMode="url" value={p.media_url ?? ""} onChange={(e) => setP({ ...p, media_url: e.target.value })} placeholder="Drive / Higgsfield…" />
          {p.media_url?.trim() && (
            <a href={/^https?:\/\//i.test(p.media_url.trim()) ? p.media_url.trim() : `https://${p.media_url.trim()}`} target="_blank" rel="noreferrer" className="absolute inset-y-0 end-0 px-3 grid place-items-center text-ink-2 hover:text-navy" title="فتح الرابط">
              <ExternalLink size={16} />
            </a>
          )}
        </div>
      </Field>
      <Field label="ملاحظات داخلية" className="sm:col-span-3">
        <textarea className="field min-h-16" value={p.notes ?? ""} onChange={(e) => setP({ ...p, notes: e.target.value })} />
      </Field>
      {p.id && <Comments postId={p.id} />}
      <div className="sm:col-span-3 flex items-center justify-between gap-3 pt-2 border-t border-silver-200">
        <div>
          {p.id && (
            <button type="button" className="btn-danger h-10 px-3 text-sm" onClick={del}>
              <Trash2 size={15} /> حذف
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => onClose()}>
            إلغاء
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </div>
      </div>
    </form>
  );
}
