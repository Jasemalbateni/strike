"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Type, Heading2, ImagePlus, Lightbulb, Minus, Video, ArrowUp, ArrowDown, Trash2, Plus, FileUp, Eye, PenLine, Check, Loader2, Presentation, FileText, X, Bell } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui";
import { BlocksView } from "./blocks";
import { pdfCover, shrinkImage } from "./pdf";
import { BUCKET, CATEGORIES, newId, pathsOf, youtubeEmbed, type Block, type Resource } from "@/lib/resources";

type Draft = Pick<Resource, "kind" | "title" | "category" | "summary" | "blocks" | "pdf_path" | "pdf_pages" | "cover_path" | "pinned" | "published">;

const ADDERS: { type: Block["type"]; label: string; icon: ReactNode }[] = [
  { type: "text", label: "نص", icon: <Type size={16} /> },
  { type: "heading", label: "عنوان", icon: <Heading2 size={16} /> },
  { type: "image", label: "صورة", icon: <ImagePlus size={16} /> },
  { type: "tip", label: "نصيحة", icon: <Lightbulb size={16} /> },
  { type: "youtube", label: "فيديو يوتيوب", icon: <Video size={16} /> },
  { type: "divider", label: "فاصل", icon: <Minus size={16} /> },
];

export default function ResourceEditor({ existing, initialUrls = {}, initialKind = "article" }: { existing?: Resource; initialUrls?: Record<string, string>; initialKind?: "article" | "presentation" }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rid] = useState(() => existing?.id ?? crypto.randomUUID());
  const [d, setD] = useState<Draft>(
    existing
      ? { kind: existing.kind, title: existing.title, category: existing.category, summary: existing.summary, blocks: existing.blocks ?? [], pdf_path: existing.pdf_path, pdf_pages: existing.pdf_pages, cover_path: existing.cover_path, pinned: existing.pinned, published: existing.published }
      : { kind: initialKind, title: "", category: initialKind === "presentation" ? "meetings" : "general", summary: "", blocks: initialKind === "article" ? [{ id: newId(), type: "text", text: "" }] : [], pdf_path: null, pdf_pages: null, cover_path: null, pinned: false, published: true },
  );
  const [urls, setUrls] = useState<Record<string, string>>(initialUrls);
  const [uploads, setUploads] = useState<string[]>([]); // paths uploaded during this edit
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(false);
  const [notify, setNotify] = useState(!existing);
  const imgInput = useRef<HTMLInputElement>(null);
  const insertAt = useRef<number>(0);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setBlock = (id: string, patch: Partial<Block>) => setD((x) => ({ ...x, blocks: x.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)) }));
  const move = (i: number, dir: -1 | 1) =>
    setD((x) => {
      const j = i + dir;
      if (j < 0 || j >= x.blocks.length) return x;
      const b = [...x.blocks];
      [b[i], b[j]] = [b[j], b[i]];
      return { ...x, blocks: b };
    });
  const removeBlock = (id: string) => setD((x) => ({ ...x, blocks: x.blocks.filter((b) => b.id !== id) }));

  async function sign(paths: string[]) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6);
    if (data) setUrls((u) => ({ ...u, ...(Object.fromEntries(data.filter((s) => s.path).map((s) => [s.path as string, s.signedUrl])) as Record<string, string>) }));
  }

  function add(type: Block["type"], at: number) {
    if (type === "image") {
      insertAt.current = at;
      imgInput.current?.click();
      return;
    }
    const b: Block =
      type === "text" ? { id: newId(), type, text: "" } : type === "heading" ? { id: newId(), type, text: "" } : type === "tip" ? { id: newId(), type, text: "", tone: "tip" } : type === "youtube" ? { id: newId(), type, url: "" } : { id: newId(), type: "divider" };
    setD((x) => ({ ...x, blocks: [...x.blocks.slice(0, at), b, ...x.blocks.slice(at)] }));
  }

  async function onImages(files: FileList | null) {
    if (!files?.length) return;
    setBusy("جارٍ رفع الصور…");
    setErr("");
    const added: Block[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const { blob, type, ext } = await shrinkImage(f);
        const path = `${rid}/img-${newId()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type });
        if (error) throw error;
        added.push({ id: newId(), type: "image", path, caption: "" });
      } catch {
        setErr("تعذر رفع صورة — جرّب مرة ثانية");
      }
    }
    if (added.length) {
      const paths = added.map((b) => (b as Extract<Block, { type: "image" }>).path);
      setUploads((u) => [...u, ...paths]);
      await sign(paths);
      const at = insertAt.current;
      setD((x) => ({ ...x, blocks: [...x.blocks.slice(0, at), ...added, ...x.blocks.slice(at)] }));
    }
    setBusy(null);
    if (imgInput.current) imgInput.current.value = "";
  }

  async function onPdf(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf") return setErr("الملف لازم يكون PDF");
    if (file.size > 50 * 1024 * 1024) return setErr("الحد الأقصى 50 ميغا — صدّر البرزنتيشن بجودة أقل");
    setErr("");
    setBusy("جارٍ تجهيز البرزنتيشن…");
    try {
      const { blob, pages } = await pdfCover(file);
      const base = `${rid}/deck-${newId()}`;
      const up = await supabase.storage.from(BUCKET).upload(`${base}.pdf`, file, { contentType: "application/pdf" });
      if (up.error) throw up.error;
      let cover: string | null = null;
      if (blob) {
        const c = await supabase.storage.from(BUCKET).upload(`${base}-cover.jpg`, blob, { contentType: "image/jpeg" });
        if (!c.error) cover = `${base}-cover.jpg`;
      }
      const newPaths = [`${base}.pdf`, ...(cover ? [cover] : [])];
      setUploads((u) => [...u, ...newPaths]);
      await sign(newPaths);
      setD((x) => ({ ...x, pdf_path: `${base}.pdf`, pdf_pages: pages, cover_path: cover, title: x.title || file.name.replace(/\.pdf$/i, "") }));
    } catch {
      setErr("تعذر رفع الملف — تحقق من الاتصال");
    }
    setBusy(null);
  }

  async function save() {
    setErr("");
    if (!d.title.trim()) return setErr("اكتب عنوان");
    if (d.kind === "presentation" && !d.pdf_path) return setErr("ارفع ملف البرزنتيشن (PDF)");
    const blocks = d.blocks.filter((b) => (b.type === "text" || b.type === "heading" || b.type === "tip" ? b.text.trim() : b.type === "youtube" ? youtubeEmbed(b.url) : true));
    if (d.kind === "article" && !blocks.length) return setErr("الموضوع فاضي — اكتب شي");
    setBusy("جارٍ الحفظ…");
    const payload = { ...d, title: d.title.trim(), summary: d.summary.trim(), blocks };
    const res = existing ? await supabase.from("resources").update(payload).eq("id", rid).select("id").single() : await supabase.from("resources").insert({ id: rid, ...payload }).select("id").single();
    if (res.error) {
      setBusy(null);
      return setErr("تعذر الحفظ — تحقق من الاتصال");
    }
    // files no longer referenced (replaced PDF, removed images)
    const keep = new Set(pathsOf({ ...payload }));
    const before = existing ? pathsOf(existing) : [];
    const orphans = [...before, ...uploads].filter((p) => !keep.has(p));
    if (orphans.length) await supabase.storage.from(BUCKET).remove(orphans);

    // tell the staff
    const firstPublish = d.published && (!existing || !existing.published);
    if (notify && firstPublish) {
      const { data: staff } = await supabase.from("profiles").select("id").eq("is_active", true);
      const { data: auth } = await supabase.auth.getUser();
      const rows = ((staff ?? []) as { id: string }[])
        .filter((s) => s.id !== auth.user?.id)
        .map((s) => ({ recipient_id: s.id, kind: "general", title: `${d.kind === "presentation" ? "برزنتيشن جديد" : "موضوع جديد"} في المصادر: ${payload.title}`, body: payload.summary, link: `/resources/${rid}`, channel: "site" }));
      if (rows.length) await supabase.from("notifications").insert(rows);
    }
    router.replace(`/resources/${rid}`);
    router.refresh();
  }

  async function cancel() {
    if (!existing && uploads.length) await supabase.storage.from(BUCKET).remove(uploads);
    router.back();
  }

  const addBar = (at: number, compact?: boolean) => (
    <div className={clsx("flex flex-wrap gap-1.5", compact ? "justify-center" : "")}>
      {ADDERS.map((a) => (
        <button key={a.type} type="button" onClick={() => add(a.type, at)} className={clsx("chip gap-1.5 bg-white border border-silver-200 text-navy hover:border-ice", compact ? "h-8 px-2.5 text-[12px]" : "h-9 px-3 text-[13px]")}>
          {a.icon}
          {a.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-3xl mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-navy text-[22px] sm:text-[26px] font-extrabold">{existing ? "تعديل" : d.kind === "presentation" ? "برزنتيشن جديد" : "موضوع جديد"}</h1>
          <div className="ms-auto flex rounded-xl p-0.5 bg-silver-100">
            <button type="button" onClick={() => setPreview(false)} className={clsx("h-9 px-3 rounded-lg text-[13px] font-bold flex items-center gap-1.5", !preview ? "bg-white text-navy shadow-sm" : "text-ink-2")}>
              <PenLine size={15} /> كتابة
            </button>
            <button type="button" onClick={() => setPreview(true)} className={clsx("h-9 px-3 rounded-lg text-[13px] font-bold flex items-center gap-1.5", preview ? "bg-white text-navy shadow-sm" : "text-ink-2")}>
              <Eye size={15} /> معاينة
            </button>
          </div>
        </div>

        {preview ? (
          <div className="card p-5 sm:p-7 flex flex-col gap-4">
            <h2 className="text-navy text-[26px] font-extrabold leading-tight">{d.title || "بدون عنوان"}</h2>
            {d.summary && <p className="text-ink-2 text-[16px]">{d.summary}</p>}
            {d.cover_path && urls[d.cover_path] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[d.cover_path]} alt="" className="rounded-xl border border-silver-200" />
            )}
            <BlocksView blocks={d.blocks} urls={urls} />
          </div>
        ) : (
          <>
            <div className="card p-4 sm:p-5 flex flex-col gap-4">
              <div className="flex rounded-xl p-0.5 bg-silver-100 w-fit">
                <button type="button" onClick={() => set("kind", "article")} className={clsx("h-9 px-3 rounded-lg text-[13px] font-bold flex items-center gap-1.5", d.kind === "article" ? "bg-white text-navy shadow-sm" : "text-ink-2")}>
                  <FileText size={15} /> موضوع
                </button>
                <button type="button" onClick={() => set("kind", "presentation")} className={clsx("h-9 px-3 rounded-lg text-[13px] font-bold flex items-center gap-1.5", d.kind === "presentation" ? "bg-white text-navy shadow-sm" : "text-ink-2")}>
                  <Presentation size={15} /> برزنتيشن
                </button>
              </div>
              <Field label="العنوان">
                <input className="field text-[17px] font-bold" value={d.title} onChange={(e) => set("title", e.target.value)} placeholder={d.kind === "presentation" ? "مثلاً: اجتماع المدربين — أكتوبر" : "مثلاً: كيف تدير أول ٥ دقائق من الحصة"} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="التصنيف">
                  <select className="field" value={d.category} onChange={(e) => set("category", e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="نبذة قصيرة (تظهر في القائمة)">
                  <input className="field" value={d.summary} onChange={(e) => set("summary", e.target.value)} placeholder="سطر واحد عن الموضوع" />
                </Field>
              </div>

              {d.kind === "presentation" && (
                <div className="rounded-xl border-2 border-dashed border-silver-200 p-4 flex flex-col sm:flex-row items-center gap-4">
                  {d.cover_path && urls[d.cover_path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[d.cover_path]} alt="" className="w-40 rounded-lg border border-silver-200" />
                  ) : (
                    <span className="h-20 w-32 rounded-lg bg-silver-100 grid place-items-center text-ink-2">
                      <Presentation size={28} />
                    </span>
                  )}
                  <div className="flex-1 text-center sm:text-start">
                    <div className="font-bold text-navy text-[14px]">{d.pdf_path ? `ملف PDF — ${d.pdf_pages ?? "?"} صفحة` : "ارفع البرزنتيشن كملف PDF"}</div>
                    <div className="text-ink-2 text-[12.5px]">من PowerPoint أو Keynote أو Canva: ملف ← تصدير ← PDF. الحد 50 ميغا.</div>
                  </div>
                  <label className="btn-outline h-10 cursor-pointer">
                    <FileUp size={16} /> {d.pdf_path ? "استبدال" : "اختيار ملف"}
                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => onPdf(e.target.files?.[0])} />
                  </label>
                </div>
              )}
            </div>

            {/* blocks */}
            <div className="flex flex-col gap-2">
              <div className="text-navy font-extrabold text-[15px]">{d.kind === "presentation" ? "ملخص أو ملاحظات (اختياري)" : "المحتوى"}</div>
              <p className="text-ink-2 text-[12.5px] -mt-1">
                رتّب الكلام والصور زي ما تبي. في النص: <b className="text-navy">**كلمة**</b> للخط العريض، وابدأ السطر بـ <b className="text-navy">-</b> للنقاط أو <b className="text-navy">1.</b> للترقيم.
              </p>
              {d.blocks.map((b, i) => (
                <div key={b.id} className="flex flex-col gap-2">
                  <div className="group card p-3 flex gap-2 items-start">
                    <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="h-7 w-7 grid place-items-center rounded text-ink-2 hover:bg-silver-100 disabled:opacity-25" aria-label="تحريك لفوق">
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === d.blocks.length - 1} className="h-7 w-7 grid place-items-center rounded text-ink-2 hover:bg-silver-100 disabled:opacity-25" aria-label="تحريك لتحت">
                        <ArrowDown size={14} />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      {b.type === "text" && <AutoText value={b.text} onChange={(v) => setBlock(b.id, { text: v })} placeholder="اكتب هنا…" className="text-[15.5px] leading-[1.9]" />}
                      {b.type === "heading" && <input className="field text-[19px] font-extrabold" value={b.text} onChange={(e) => setBlock(b.id, { text: e.target.value })} placeholder="عنوان فرعي" />}
                      {b.type === "tip" && (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-1.5">
                            {(["tip", "warning"] as const).map((t) => (
                              <button key={t} type="button" onClick={() => setBlock(b.id, { tone: t })} className={clsx("chip h-7 px-2.5 text-[12px]", b.tone === t ? (t === "tip" ? "bg-ice text-navy-900" : "bg-error text-white") : "bg-silver-100 text-ink-2")}>
                                {t === "tip" ? "نصيحة" : "تنبيه"}
                              </button>
                            ))}
                          </div>
                          <AutoText value={b.text} onChange={(v) => setBlock(b.id, { text: v })} placeholder="النصيحة أو النقطة المهمة" className={b.tone === "warning" ? "bg-error-100/50" : "bg-ice-50"} />
                        </div>
                      )}
                      {b.type === "image" && (
                        <div className="flex flex-col gap-2">
                          {urls[b.path] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={urls[b.path]} alt="" className="max-h-80 w-auto rounded-xl border border-silver-200 mx-auto" />
                          ) : (
                            <div className="h-32 rounded-xl bg-silver-100" />
                          )}
                          <input className="field h-10 text-[13.5px]" value={b.caption} onChange={(e) => setBlock(b.id, { caption: e.target.value })} placeholder="تعليق تحت الصورة (اختياري)" />
                        </div>
                      )}
                      {b.type === "youtube" && (
                        <div className="flex flex-col gap-2">
                          <input className="field en" dir="ltr" value={b.url} onChange={(e) => setBlock(b.id, { url: e.target.value })} placeholder="https://youtube.com/watch?v=…" />
                          {b.url && !youtubeEmbed(b.url) && <span className="text-error text-[12px] font-bold">الرابط مو رابط يوتيوب صحيح</span>}
                          {youtubeEmbed(b.url) && <BlocksView blocks={[b]} urls={{}} />}
                        </div>
                      )}
                      {b.type === "divider" && <hr className="border-silver-200 my-4" />}
                    </div>
                    <button type="button" onClick={() => removeBlock(b.id)} className="h-8 w-8 grid place-items-center rounded-lg text-ink-2 hover:bg-error-100 hover:text-error shrink-0" aria-label="حذف">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {i < d.blocks.length - 1 && <InsertHere>{(close) => <div onClick={close}>{addBar(i + 1, true)}</div>}</InsertHere>}
                </div>
              ))}
              <div className="rounded-xl border border-dashed border-silver-200 p-3 flex flex-col gap-2">
                <span className="text-[12.5px] font-bold text-ink-2 flex items-center gap-1">
                  <Plus size={14} /> أضف للنهاية
                </span>
                {addBar(d.blocks.length)}
              </div>
              <input ref={imgInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onImages(e.target.files)} />
            </div>
          </>
        )}

        {/* publish bar */}
        <div className="card p-4 flex flex-col gap-3 sticky bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-4 z-10 shadow-[var(--shadow-pop)]">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
            <Toggle on={d.published} onChange={(v) => set("published", v)} label={d.published ? "منشور للكل" : "مسودة (لك بس)"} />
            <Toggle on={d.pinned} onChange={(v) => set("pinned", v)} label="تثبيت في الأعلى" />
            {d.published && (!existing || !existing.published) && (
              <Toggle on={notify} onChange={setNotify} label={<span className="flex items-center gap-1"><Bell size={13} /> تنبيه كل الفريق</span>} />
            )}
          </div>
          <div className="flex items-center gap-2">
            {busy && (
              <span className="text-ink-2 text-[13px] flex items-center gap-1.5">
                <Loader2 size={15} className="animate-spin" /> {busy}
              </span>
            )}
            {err && <span className="text-error text-[13px] font-bold">{err}</span>}
            <div className="ms-auto flex gap-2">
              {existing ? (
                <Link href={`/resources/${existing.id}`} className="btn-ghost h-11">
                  <X size={16} /> إلغاء
                </Link>
              ) : (
                <button type="button" onClick={cancel} className="btn-ghost h-11">
                  <X size={16} /> إلغاء
                </button>
              )}
              <button type="button" onClick={save} disabled={!!busy} className="btn-primary h-11">
                <Check size={17} /> {existing ? "حفظ التعديلات" : d.published ? "نشر" : "حفظ كمسودة"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AutoText({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <textarea
      className={clsx("field w-full py-2.5 resize-none overflow-hidden min-h-[96px]", className)}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      ref={(el) => {
        if (el) {
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight + 2}px`;
        }
      }}
      onInput={(e) => {
        const el = e.currentTarget;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight + 2}px`;
      }}
    />
  );
}

function InsertHere({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="rounded-xl bg-white/70 border border-ice/50 p-2 flex items-center gap-2 fade-up">
      <div className="flex-1">{children(() => setOpen(false))}</div>
      <button type="button" onClick={() => setOpen(false)} className="h-7 w-7 grid place-items-center rounded text-ink-2" aria-label="إغلاق">
        <X size={14} />
      </button>
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="self-center h-6 px-2.5 rounded-full text-[11.5px] font-bold text-ink-2 hover:text-navy hover:bg-white border border-transparent hover:border-silver-200 flex items-center gap-1 transition">
      <Plus size={12} /> إدراج هنا
    </button>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center gap-2 font-bold text-navy">
      <span className={clsx("h-6 w-10 rounded-full p-0.5 transition", on ? "bg-ice" : "bg-silver-200")}>
        <span className={clsx("block h-5 w-5 rounded-full bg-white shadow transition", on ? "-translate-x-4" : "")} />
      </span>
      {label}
    </button>
  );
}
