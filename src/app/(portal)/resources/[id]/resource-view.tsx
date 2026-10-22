"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowRight, Pencil, Trash2, Send, MessageSquare, Eye, Clock, Pin, EyeOff } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/confirm";
import { Avatar } from "@/components/ui";
import { BlocksView } from "@/components/resources/blocks";
import { ago } from "@/lib/notifications";
import { BUCKET, categoryLabel, pathsOf, readMinutes, type Resource, type ResourceComment } from "@/lib/resources";
import type { StaffName } from "@/lib/types";

const PdfViewer = dynamic(() => import("@/components/resources/pdf-viewer"), { ssr: false, loading: () => <div className="aspect-video rounded-xl bg-silver-100 animate-pulse" /> });

export default function ResourceView({
  me,
  resource: r,
  urls,
  initialComments,
  names,
  reads,
  staff,
}: {
  me: { id: string; isOwner: boolean };
  resource: Resource;
  urls: Record<string, string>;
  initialComments: ResourceComment[];
  names: StaffName[];
  reads: { user_id: string; read_at: string }[];
  staff: { id: string; full_name: string }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const confirm = useConfirm();
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [showReaders, setShowReaders] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const nameOf = (id: string | null) => names.find((n) => n.id === id)?.full_name ?? "—";

  // read receipt (once per person)
  useEffect(() => {
    supabase.from("resource_reads").upsert({ resource_id: r.id, user_id: me.id }, { onConflict: "resource_id,user_id", ignoreDuplicates: true }).then(() => {});
  }, [supabase, r.id, me.id]);

  // live comments
  useEffect(() => {
    const ch = supabase
      .channel(`rc-${r.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "resource_comments", filter: `resource_id=eq.${r.id}` }, (p) => {
        const c = p.new as ResourceComment;
        setComments((list) => (list.some((x) => x.id === c.id) ? list : [...list, c]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "resource_comments" }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (id) setComments((list) => list.filter((x) => x.id !== id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, r.id]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const { data } = await supabase.from("resource_comments").insert({ resource_id: r.id, body: text }).select("*").single();
    setBusy(false);
    if (data) {
      setComments((list) => (list.some((x) => x.id === (data as ResourceComment).id) ? list : [...list, data as ResourceComment]));
      setBody("");
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    }
  }
  async function removeComment(c: ResourceComment) {
    if (!(await confirm({ title: "حذف التعليق؟", message: c.body.slice(0, 80), confirmText: "حذف" }))) return;
    const { error } = await supabase.from("resource_comments").delete().eq("id", c.id);
    if (!error) setComments((list) => list.filter((x) => x.id !== c.id));
  }
  async function removeResource() {
    if (!(await confirm({ title: "حذف هذا الموضوع؟", message: `${r.title} — ينحذف مع تعليقاته وملفاته.`, confirmText: "حذف نهائي" }))) return;
    const paths = pathsOf(r);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from("resources").delete().eq("id", r.id);
    if (!error) {
      router.replace("/resources");
      router.refresh();
    }
  }

  const readIds = new Set(reads.map((x) => x.user_id));
  const readers = staff.filter((s) => readIds.has(s.id));
  const notYet = staff.filter((s) => !readIds.has(s.id));

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <Link href="/resources" className="text-ink-2 text-[14px] font-bold flex items-center gap-1 hover:text-navy">
            <ArrowRight size={16} /> المصادر
          </Link>
          {me.isOwner && (
            <div className="ms-auto flex gap-1">
              <Link href={`/resources/${r.id}/edit`} className="btn-ghost h-9 text-[13px]">
                <Pencil size={15} /> تعديل
              </Link>
              <button onClick={removeResource} className="h-9 w-9 grid place-items-center rounded-lg text-ink-2 hover:bg-error-100 hover:text-error" aria-label="حذف">
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>

        <header className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="chip bg-ice-50 text-ice-600">{categoryLabel(r.category)}</span>
            {r.kind === "presentation" && <span className="chip bg-navy text-white">برزنتيشن</span>}
            {r.pinned && (
              <span className="chip bg-gold/25 text-[#8a6a00] gap-1">
                <Pin size={12} /> مثبّت
              </span>
            )}
            {!r.published && (
              <span className="chip bg-silver-200 text-ink-2 gap-1">
                <EyeOff size={12} /> مسودة — ما يشوفها غيرك
              </span>
            )}
          </div>
          <h1 className="text-navy text-[27px] sm:text-[34px] font-extrabold leading-tight">{r.title}</h1>
          {r.summary && <p className="text-ink-2 text-[16px] leading-relaxed">{r.summary}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
            <span className="flex items-center gap-1.5">
              <Avatar name={nameOf(r.created_by)} size={22} />
              {nameOf(r.created_by)}
            </span>
            <span>{format(parseISO(r.created_at), "d MMMM yyyy", { locale: ar })}</span>
            <span className="flex items-center gap-1">
              <Clock size={13} /> <span className="num">{readMinutes(r)}</span> دقائق
            </span>
            {me.isOwner && (
              <button onClick={() => setShowReaders((v) => !v)} className="flex items-center gap-1 font-bold text-navy hover:text-ice-600">
                <Eye size={14} /> قرأه <span className="num">{readers.length}</span> من <span className="num">{staff.length}</span>
              </button>
            )}
          </div>
          {me.isOwner && showReaders && (
            <div className="card p-3 text-[13px] flex flex-col gap-2 fade-up">
              <div>
                <span className="font-bold text-[#1a8f5f]">قرأوه: </span>
                {readers.length ? readers.map((s) => s.full_name).join("، ") : "ما أحد بعد"}
              </div>
              {notYet.length > 0 && (
                <div>
                  <span className="font-bold text-ink-2">ما قرأوه: </span>
                  {notYet.map((s) => s.full_name).join("، ")}
                </div>
              )}
            </div>
          )}
        </header>

        {r.pdf_path && urls[r.pdf_path] && <PdfViewer url={urls[r.pdf_path]} title={r.title} />}
        {r.blocks.length > 0 && <BlocksView blocks={r.blocks} urls={urls} />}

        {/* thread */}
        <section className="flex flex-col gap-3 border-t border-silver-200 pt-6">
          <h2 className="text-navy font-extrabold text-[18px] flex items-center gap-2">
            <MessageSquare size={19} className="text-ice-600" /> النقاش <span className="num text-ink-2 text-[15px]">({comments.length})</span>
          </h2>
          {comments.length === 0 && <p className="text-ink-2 text-[14px]">كن أول من يعلّق — سؤال، فكرة، أو تجربة من الملعب.</p>}
          <div className="flex flex-col gap-3">
            {comments.map((c) => {
              const mine = c.created_by === me.id;
              return (
                <div key={c.id} className={clsx("flex gap-2.5", mine && "flex-row-reverse")}>
                  <Avatar name={nameOf(c.created_by)} size={34} tone={mine ? "ice" : "navy"} />
                  <div className={clsx("min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2.5", mine ? "bg-ice-50 rounded-se-md" : "bg-white border border-silver-200 rounded-ss-md")}>
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="font-bold text-navy">{nameOf(c.created_by)}</span>
                      <span className="text-ink-2">{ago(c.created_at)}</span>
                      {(mine || me.isOwner) && (
                        <button onClick={() => removeComment(c)} className="text-ink-2 hover:text-error ms-1" aria-label="حذف التعليق">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <p className="text-[14.5px] text-navy whitespace-pre-line leading-relaxed mt-0.5">{c.body}</p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="flex items-end gap-2 sticky bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-4 bg-silver-100/90 backdrop-blur py-2">
            <textarea
              className="field flex-1 min-h-[48px] max-h-40 py-3 leading-relaxed"
              rows={1}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e);
              }}
              placeholder="اكتب تعليقك…"
            />
            <button className="btn-primary h-12 w-12 p-0 shrink-0" disabled={busy || !body.trim()} aria-label="إرسال">
              <Send size={18} className="-scale-x-100" />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
