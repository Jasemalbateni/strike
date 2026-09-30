"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { format, addDays, parseISO } from "date-fns";
import { ArrowRight, BadgeCheck, CalendarPlus, Check, CopyPlus, Ellipsis, FilePen, Info, Send, Trash2, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field } from "@/components/ui";
import { useConfirm } from "@/components/confirm";
import { newBoard, parseBoard } from "@/lib/drills/board";
import { AGE_GROUPS, CATEGORIES, EMPTY_META, metaLine, STATUS_LABEL, type Drill, type DrillMeta, type DrillStatus } from "@/lib/drills/meta";
import type { Board } from "@/lib/drills/types";
import type { Branch, Group } from "@/lib/players";
import { isTrainingDay } from "@/lib/players";
import { bidi } from "@/lib/bidi";

const Editor = dynamic(() => import("./editor"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-40 bg-[#0b1429] grid place-items-center">
      <div className="flex flex-col items-center gap-3 text-silver">
        <span className="h-10 w-10 rounded-full border-[3px] border-ice/30 border-t-ice animate-spin" />
        <span className="text-sm font-bold">تجهيز لوحة الرسم…</span>
      </div>
    </div>
  ),
});

export type StudioMe = { id: string; name: string; isOwner: boolean; canDraw: boolean; canApprove: boolean; canCalendar: boolean };

type Props = {
  drill: Drill | null;
  source?: Drill | null;
  me: StudioMe;
  authorName?: string;
  reviewerName?: string;
  branches: Branch[];
  groups: Group[];
  today: string;
};

const backupKey = (id: string | null) => `strike-drill-backup:${id ?? "new"}`;

export default function DrillStudio({ drill, source, me, authorName, reviewerName, branches, groups, today }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const supabase = useMemo(() => createClient(), []);

  const [drillId, setDrillId] = useState<string | null>(drill?.id ?? null);
  const [status, setStatus] = useState<DrillStatus>(drill?.status ?? "draft");
  const [reviewNote, setReviewNote] = useState(drill?.review_note ?? "");
  const [authorId] = useState<string | null>(drill?.author_id ?? me.id);
  const [meta, setMeta] = useState<DrillMeta>(() => {
    const base = drill ?? source;
    if (!base) return EMPTY_META;
    const m: DrillMeta = { title: base.title, description: base.description, coaching_points: base.coaching_points, category: base.category, age_group: base.age_group, duration_min: base.duration_min, players: base.players, area: base.area, equipment: base.equipment };
    return source && !drill ? { ...m, title: `${base.title} (نسخة)` } : m;
  });
  const currentMeta = meta;
  const [initialBoard, setInitialBoard] = useState<Board>(() => (drill ? parseBoard(drill.board) : source ? parseBoard(source.board) : newBoard("half")));
  const [editorKey, setEditorKey] = useState(0);
  const boardRef = useRef<Board>(initialBoard);
  const [dirty, setDirty] = useState(!!source && !drill);
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [afterDetails, setAfterDetails] = useState<null | "save" | "submit" | "approve">(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone?: "ok" | "err" } | null>(null);
  const [backup, setBackup] = useState<{ board: Board; meta: DrillMeta; at: number } | null>(null);

  const isAuthor = !drill || drill.author_id === me.id;
  const canEdit = me.canDraw && (!drillId ? true : me.canApprove ? status !== "draft" || authorId === me.id : isAuthor && status !== "approved");
  const readOnly = !canEdit;

  function flash(text: string, tone: "ok" | "err" = "ok") {
    setToast({ text, tone });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 2600);
  }

  /* ---------- crash-safe local backup of unsaved work ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(backupKey(drill?.id ?? null));
      if (!raw) return;
      const b = JSON.parse(raw) as { board: Board; meta: DrillMeta; at: number };
      const savedAt = drill ? new Date(drill.updated_at).getTime() : 0;
      if (b && b.at > savedAt + 1000) {
        const id = window.setTimeout(() => setBackup(b), 0);
        return () => window.clearTimeout(id);
      }
    } catch {}
  }, [drill]);

  const backupTimer = useRef(0);
  function scheduleBackup(m: DrillMeta = meta) {
    window.clearTimeout(backupTimer.current);
    backupTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(backupKey(drillId), JSON.stringify({ board: boardRef.current, meta: m, at: Date.now() }));
      } catch {}
    }, 1200);
  }
  function clearBackup(id: string | null) {
    window.clearTimeout(backupTimer.current);
    try {
      localStorage.removeItem(backupKey(id));
      localStorage.removeItem(backupKey(null));
    } catch {}
  }

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  /* ---------- persistence ---------- */
  async function persist(nextStatus?: DrillStatus, note?: string, meta: DrillMeta = currentMeta): Promise<boolean> {
    if (!meta.title.trim()) {
      setAfterDetails(nextStatus === "pending" ? "submit" : nextStatus === "approved" ? "approve" : "save");
      setDetailsOpen(true);
      return false;
    }
    setSaving(true);
    const payload = {
      ...meta,
      title: meta.title.trim(),
      duration_min: meta.duration_min || null,
      board: boardRef.current,
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(note !== undefined ? { review_note: note } : {}),
    };
    let res;
    if (!drillId) {
      const st: DrillStatus = nextStatus ?? (me.canApprove ? "approved" : "draft");
      res = await supabase.from("drills").insert({ ...payload, status: st }).select("id, status, review_note").single();
    } else {
      res = await supabase.from("drills").update(payload).eq("id", drillId).select("id, status, review_note").single();
    }
    setSaving(false);
    if (res.error || !res.data) {
      flash("تعذّر الحفظ — تحقق من الاتصال", "err");
      return false;
    }
    const wasNew = !drillId;
    setDrillId(res.data.id);
    setStatus(res.data.status as DrillStatus);
    setReviewNote(res.data.review_note ?? "");
    setDirty(false);
    clearBackup(res.data.id);
    if (wasNew) window.history.replaceState(null, "", `/drills/${res.data.id}`);
    return true;
  }

  async function save(m?: DrillMeta) {
    if (readOnly || saving) return;
    const ok = await persist(undefined, undefined, m);
    if (ok) flash(status === "approved" || (!drillId && me.canApprove) ? "تم الحفظ في المكتبة" : "تم الحفظ");
  }
  async function saveDraft() {
    const ok = await persist("draft");
    if (ok) flash("حُفظ كمسودة");
  }
  async function submit(m?: DrillMeta) {
    const ok = await persist("pending", undefined, m);
    if (ok) flash("أُرسل للاعتماد");
  }
  async function approve(m?: DrillMeta) {
    const ok = await persist("approved", undefined, m);
    if (ok) flash("اعتُمد وأُضيف للمكتبة");
  }
  async function sendBack(note: string) {
    const ok = await persist("returned", note);
    if (ok) {
      setReturnOpen(false);
      flash("أُرجع للمدرب مع الملاحظة");
    }
  }
  async function remove() {
    if (!drillId) return;
    if (!(await confirm({ title: "حذف التمرين؟", message: "يُحذف التمرين وكل مواعيده في التقويم. ما ينفع التراجع.", confirmText: "حذف" }))) return;
    const { error } = await supabase.from("drills").delete().eq("id", drillId);
    if (error) return flash("تعذّر الحذف", "err");
    clearBackup(drillId);
    setDirty(false);
    router.push("/drills");
  }
  async function leave() {
    if (dirty && !(await confirm({ title: "تغييرات غير محفوظة", message: "تبي تطلع بدون حفظ؟ بتضيع آخر التعديلات.", confirmText: "خروج بدون حفظ" }))) return;
    if (dirty) clearBackup(drillId);
    setDirty(false);
    router.push("/drills");
  }

  /* ---------- ui bits ---------- */
  const statusChip = drillId ? (
    <span
      className={clsx(
        "chip shrink-0 hidden sm:inline-flex",
        status === "approved" ? "bg-ice/20 text-ice" : status === "pending" ? "bg-gold/20 text-gold" : status === "returned" ? "bg-error/25 text-[#ff9b9b]" : "bg-white/10 text-silver",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  ) : (
    <span className="chip shrink-0 hidden sm:inline-flex bg-white/10 text-silver">جديد</span>
  );

  const title = (
    <>
      <button type="button" onClick={leave} className="h-10 w-10 shrink-0 grid place-items-center rounded-xl text-silver hover:text-white hover:bg-white/[0.08]" aria-label="رجوع للتمارين">
        <ArrowRight size={20} />
      </button>
      <button type="button" onClick={() => setDetailsOpen(true)} className="min-w-0 flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-white/[0.06] text-start" title="بيانات التمرين">
        <span className="min-w-0">
          <span className="block font-extrabold text-[15px] truncate">
            {meta.title || (readOnly ? "تمرين" : "تمرين جديد")}
            {dirty && <span className="text-gold"> •</span>}
          </span>
          {meta.category || meta.duration_min ? <span className="block text-[11px] text-silver/80 truncate">{metaLine(meta)}</span> : null}
        </span>
      </button>
      {statusChip}
    </>
  );

  const canSubmit = !me.canApprove && canEdit && (status === "draft" || status === "returned");
  const canApproveNow = me.canApprove && canEdit && status !== "approved";
  const canAddToCalendar = me.canCalendar && !!drillId && status === "approved";

  const actions = (
    <div className="flex items-center gap-1.5">
      {canEdit && (
        <button
          type="button"
          onClick={() => save()}
          disabled={saving}
          className={clsx("h-10 px-3.5 rounded-xl font-bold text-[13.5px] inline-flex items-center gap-1.5 disabled:opacity-60", dirty || !drillId ? "bg-ice text-navy-900" : "bg-white/[0.08] text-white")}
        >
          <Check size={17} /> {saving ? "جارٍ…" : "حفظ"}
        </button>
      )}
      {canSubmit && (
        <button type="button" onClick={() => submit()} disabled={saving} className="hidden md:inline-flex h-10 px-3.5 rounded-xl font-bold text-[13.5px] items-center gap-1.5 bg-gold text-navy-900 disabled:opacity-60">
          <Send size={16} /> إرسال للاعتماد
        </button>
      )}
      {canApproveNow && drillId && status !== "draft" && (
        <button type="button" onClick={() => approve()} disabled={saving} className="hidden md:inline-flex h-10 px-3.5 rounded-xl font-bold text-[13.5px] items-center gap-1.5 bg-gold text-navy-900 disabled:opacity-60">
          <BadgeCheck size={17} /> اعتماد
        </button>
      )}
      <div className="relative">
        <button type="button" onClick={() => setMenuOpen((v) => !v)} className="h-10 w-10 grid place-items-center rounded-xl text-silver hover:text-white hover:bg-white/[0.08]" aria-label="المزيد" aria-expanded={menuOpen}>
          <Ellipsis size={20} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-[70]" onClick={() => setMenuOpen(false)} />
            <div className="absolute left-0 top-12 z-[71] w-60 rounded-2xl bg-white text-navy shadow-[var(--shadow-pop)] border border-silver-200 p-1.5 fade-up">
              <MenuItem icon={<Info size={17} />} onClick={() => { setMenuOpen(false); setDetailsOpen(true); }}>
                بيانات التمرين
              </MenuItem>
              {canSubmit && (
                <MenuItem icon={<Send size={17} />} onClick={() => { setMenuOpen(false); submit(); }}>
                  إرسال للاعتماد
                </MenuItem>
              )}
              {canApproveNow && (
                <MenuItem icon={<BadgeCheck size={17} />} onClick={() => { setMenuOpen(false); approve(); }}>
                  {status === "draft" || !drillId ? "حفظ في المكتبة" : "اعتماد"}
                </MenuItem>
              )}
              {me.canApprove && canEdit && !drillId && (
                <MenuItem icon={<FilePen size={17} />} onClick={() => { setMenuOpen(false); saveDraft(); }}>
                  حفظ كمسودة
                </MenuItem>
              )}
              {me.canApprove && drillId && status === "pending" && (
                <MenuItem icon={<Undo2 size={17} />} onClick={() => { setMenuOpen(false); setReturnOpen(true); }}>
                  إرجاع للتعديل
                </MenuItem>
              )}
              {canAddToCalendar && (
                <MenuItem icon={<CalendarPlus size={17} />} onClick={() => { setMenuOpen(false); setCalOpen(true); }}>
                  إضافة للتقويم
                </MenuItem>
              )}
              {me.canDraw && drillId && (
                <MenuItem icon={<CopyPlus size={17} />} onClick={() => { setMenuOpen(false); router.push(`/drills/new?from=${drillId}`); }}>
                  نسخة جديدة منه
                </MenuItem>
              )}
              {drillId && ((isAuthor && status !== "approved") || me.isOwner) && (
                <MenuItem icon={<Trash2 size={17} />} danger onClick={() => { setMenuOpen(false); remove(); }}>
                  حذف التمرين
                </MenuItem>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  let banner: React.ReactNode = null;
  if (backup) {
    banner = (
      <Banner tone="gold">
        <span className="flex-1">لقيت تعديلات ما انحفظت من آخر مرة على هذا التمرين.</span>
        <button
          type="button"
          className="h-8 px-3 rounded-lg bg-navy-900 text-white font-bold text-[12.5px]"
          onClick={() => {
            boardRef.current = backup.board;
            setInitialBoard(backup.board);
            setMeta(backup.meta);
            setEditorKey((k) => k + 1);
            setDirty(true);
            setBackup(null);
          }}
        >
          استرجاع
        </button>
        <button type="button" className="h-8 px-2 rounded-lg font-bold text-[12.5px]" onClick={() => { clearBackup(drillId); setBackup(null); }}>
          تجاهل
        </button>
      </Banner>
    );
  } else if (drillId && status === "pending" && me.canApprove && !isAuthor) {
    banner = (
      <Banner tone="gold">
        <span className="flex-1">
          بانتظار اعتمادك{authorName ? ` — أرسله ${authorName}` : ""}. تقدر تعدّل عليه قبل الاعتماد.
        </span>
        <button type="button" onClick={() => approve()} className="h-8 px-3 rounded-lg bg-navy-900 text-white font-bold text-[12.5px] inline-flex items-center gap-1">
          <BadgeCheck size={15} /> اعتماد
        </button>
        <button type="button" onClick={() => setReturnOpen(true)} className="h-8 px-3 rounded-lg bg-white/60 text-navy-900 font-bold text-[12.5px]">
          إرجاع
        </button>
      </Banner>
    );
  } else if (drillId && status === "pending" && isAuthor && !me.canApprove) {
    banner = <Banner tone="ice">أُرسل للاعتماد — بانتظار المالك أو مدير الفرع. تقدر تكمل تعديل.</Banner>;
  } else if (drillId && status === "returned" && isAuthor) {
    banner = (
      <Banner tone="error">
        <span className="flex-1">
          أُرجع للتعديل{reviewerName ? ` من ${reviewerName}` : ""}: <b>{reviewNote || "بدون ملاحظة"}</b>
        </span>
        {canSubmit && (
          <button type="button" onClick={() => submit()} className="h-8 px-3 rounded-lg bg-navy-900 text-white font-bold text-[12.5px] inline-flex items-center gap-1 shrink-0">
            <Send size={14} /> إرسال مرة ثانية
          </button>
        )}
      </Banner>
    );
  }

  const info = (
    <DrillInfo
      meta={meta}
      status={drillId ? status : null}
      authorName={authorName}
      onCalendar={canAddToCalendar ? () => setCalOpen(true) : undefined}
      onDuplicate={me.canDraw && drillId ? () => router.push(`/drills/new?from=${drillId}`) : undefined}
    />
  );

  return (
    <>
      <Editor
        key={editorKey}
        initial={initialBoard}
        readOnly={readOnly}
        onChange={(b) => {
          boardRef.current = b;
          setDirty(true);
          scheduleBackup();
        }}
        onSave={() => save()}
        title={title}
        actions={actions}
        banner={banner}
        info={info}
        exportTitle={meta.title || "تمرين"}
        exportSubtitle={metaLine(meta) || undefined}
      />

      {toast && (
        <div
          role="status"
          className={clsx(
            "fixed z-[80] left-1/2 -translate-x-1/2 top-[calc(64px+env(safe-area-inset-top))] rounded-full px-4 py-2 text-[13px] font-bold shadow-[var(--shadow-pop)] fade-up whitespace-nowrap",
            toast.tone === "err" ? "bg-error text-white" : "bg-ice text-navy-900",
          )}
        >
          {toast.text}
        </div>
      )}

      <DetailsModal
        open={detailsOpen}
        readOnly={readOnly}
        meta={meta}
        onClose={() => {
          setDetailsOpen(false);
          setAfterDetails(null);
        }}
        onSave={(m) => {
          setMeta(m);
          setDetailsOpen(false);
          setDirty(true);
          scheduleBackup(m);
          const next = afterDetails;
          setAfterDetails(null);
          if (next === "submit") submit(m);
          else if (next === "approve") approve(m);
          else if (next === "save") save(m);
        }}
        saveLabel={afterDetails === "submit" ? "حفظ وإرسال للاعتماد" : afterDetails ? "حفظ التمرين" : !drillId ? "حفظ التمرين" : "تم"}
      />

      <ReturnModal open={returnOpen} onClose={() => setReturnOpen(false)} onSend={sendBack} />

      {drillId && (
        <AddToCalendarModal
          open={calOpen}
          onClose={() => setCalOpen(false)}
          drillId={drillId}
          defaultDuration={meta.duration_min}
          branches={branches}
          groups={groups}
          today={today}
          onDone={(d) => {
            setCalOpen(false);
            flash(`أُضيف لتقويم ${d}`);
          }}
        />
      )}
    </>
  );
}

/* ====================================================================== */

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={clsx("w-full h-11 px-3 rounded-xl flex items-center gap-2.5 text-[14px] font-bold text-start", danger ? "text-error hover:bg-error-100" : "hover:bg-navy-50")}>
      <span className={danger ? "text-error" : "text-ink-2"}>{icon}</span>
      {children}
    </button>
  );
}

function Banner({ tone, children }: { tone: "gold" | "ice" | "error"; children: React.ReactNode }) {
  return (
    <div
      className={clsx(
        "shrink-0 px-3 sm:px-4 py-2 text-[13px] font-bold flex items-center gap-2 flex-wrap",
        tone === "gold" ? "bg-gold text-navy-900" : tone === "ice" ? "bg-ice text-navy-900" : "bg-error text-white",
      )}
    >
      {children}
    </div>
  );
}

function DrillInfo({ meta, status, authorName, onCalendar, onDuplicate }: { meta: DrillMeta; status: DrillStatus | null; authorName?: string; onCalendar?: () => void; onDuplicate?: () => void }) {
  const points = meta.coaching_points.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="p-4 grid gap-4 text-[14px]">
      <div>
        <div className="font-extrabold text-[17px] leading-snug">{meta.title || "تمرين"}</div>
        <div className="text-silver/80 text-[12.5px] mt-1">{metaLine(meta) || "—"}</div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {status && <span className="chip bg-white/10 text-silver">{STATUS_LABEL[status]}</span>}
          {authorName && <span className="chip bg-white/10 text-silver">إعداد: {authorName}</span>}
        </div>
      </div>
      {(onCalendar || onDuplicate) && (
        <div className="flex gap-2">
          {onCalendar && (
            <button type="button" onClick={onCalendar} className="flex-1 h-10 rounded-xl bg-ice text-navy-900 font-bold text-[13px] inline-flex items-center justify-center gap-1.5">
              <CalendarPlus size={16} /> إضافة للتقويم
            </button>
          )}
          {onDuplicate && (
            <button type="button" onClick={onDuplicate} className="flex-1 h-10 rounded-xl bg-white/[0.08] font-bold text-[13px] inline-flex items-center justify-center gap-1.5">
              <CopyPlus size={16} /> نسخة لي
            </button>
          )}
        </div>
      )}
      {meta.description && <InfoBlock title="شرح التمرين">{<p className="whitespace-pre-wrap leading-relaxed text-white/90">{meta.description}</p>}</InfoBlock>}
      {points.length > 0 && (
        <InfoBlock title="نقاط التدريب">
          <ul className="grid gap-1.5">
            {points.map((p, i) => (
              <li key={i} className="flex gap-2 leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-ice shrink-0" />
                <span className="text-white/90">{p.replace(/^[-•*]\s*/, "")}</span>
              </li>
            ))}
          </ul>
        </InfoBlock>
      )}
      {(meta.area || meta.equipment || meta.players) && (
        <InfoBlock title="التجهيز">
          <dl className="grid gap-1.5 text-[13px]">
            {meta.players && <Row k="اللاعبون" v={meta.players} />}
            {meta.area && <Row k="المساحة" v={meta.area} />}
            {meta.equipment && <Row k="الأدوات" v={meta.equipment} />}
          </dl>
        </InfoBlock>
      )}
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-bold text-silver/70 mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="text-silver/70 w-16 shrink-0">{k}</dt>
      <dd className="text-white/90 min-w-0">{bidi(v)}</dd>
    </div>
  );
}

function DetailsModal({ open, readOnly, meta, onClose, onSave, saveLabel }: { open: boolean; readOnly: boolean; meta: DrillMeta; onClose: () => void; onSave: (m: DrillMeta) => void; saveLabel: string }) {
  return open ? <DetailsForm readOnly={readOnly} meta={meta} onClose={onClose} onSave={onSave} saveLabel={saveLabel} /> : null;
}

function DetailsForm({ readOnly, meta, onClose, onSave, saveLabel }: { readOnly: boolean; meta: DrillMeta; onClose: () => void; onSave: (m: DrillMeta) => void; saveLabel: string }) {
  const [m, setM] = useState<DrillMeta>(meta);
  const [dur, setDur] = useState(meta.duration_min ? String(meta.duration_min) : "");
  const set = <K extends keyof DrillMeta>(k: K, v: DrillMeta[K]) => setM((x) => ({ ...x, [k]: v }));
  function submit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return onClose();
    if (!m.title.trim()) return;
    const n = parseInt(dur.replace(/[^0-9]/g, ""), 10);
    onSave({ ...m, title: m.title.trim(), duration_min: Number.isFinite(n) && n > 0 ? Math.min(n, 600) : null });
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={readOnly ? "بيانات التمرين" : "بيانات التمرين"}
      wide
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {readOnly ? "إغلاق" : "إلغاء"}
          </button>
          {!readOnly && (
            <button form="drill-meta" className="btn-primary" disabled={!m.title.trim()}>
              <Check size={17} /> {saveLabel}
            </button>
          )}
        </>
      }
    >
      <form id="drill-meta" onSubmit={submit} className="grid gap-4">
        <Field label="اسم التمرين *">
          <input className="field" value={m.title} onChange={(e) => set("title", e.target.value)} placeholder="مثال: تمرير في مثلثات" required disabled={readOnly} autoFocus={!m.title} />
        </Field>
        <Field label="التصنيف" group>
          <Chips options={CATEGORIES} value={m.category} onChange={(v) => set("category", v)} disabled={readOnly} />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="الفئة العمرية" group>
            <Chips options={AGE_GROUPS} value={m.age_group} onChange={(v) => set("age_group", v)} disabled={readOnly} num />
          </Field>
          <Field label="المدة (دقيقة)" group>
            <div className="flex gap-1.5 items-center">
              <input className="field num w-24" dir="ltr" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="15" disabled={readOnly} aria-label="المدة بالدقائق" />
              {[10, 15, 20, 30].map((n) => (
                <button key={n} type="button" disabled={readOnly} onClick={() => setDur(String(n))} className={clsx("chip num h-9 px-3 text-[13px]", dur === String(n) ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
                  {n}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="عدد اللاعبين">
            <input className="field" value={m.players} onChange={(e) => set("players", e.target.value)} placeholder="8–12" disabled={readOnly} />
          </Field>
          <Field label="المساحة">
            <input className="field" value={m.area} onChange={(e) => set("area", e.target.value)} placeholder="20×30 م" disabled={readOnly} />
          </Field>
          <Field label="الأدوات">
            <input className="field" value={m.equipment} onChange={(e) => set("equipment", e.target.value)} placeholder="8 أقماع، 6 كرات، 4 صدريات" disabled={readOnly} />
          </Field>
        </div>
        <Field label="شرح التمرين">
          <textarea className="field min-h-[96px]" value={m.description} onChange={(e) => set("description", e.target.value)} placeholder="طريقة التنظيم، التدوير، القواعد…" disabled={readOnly} />
        </Field>
        <Field label="نقاط التدريب (كل نقطة في سطر)">
          <textarea className="field min-h-[96px]" value={m.coaching_points} onChange={(e) => set("coaching_points", e.target.value)} placeholder={"الاستلام بالقدم البعيدة\nرفع الرأس قبل التمرير"} disabled={readOnly} />
        </Field>
      </form>
    </Modal>
  );
}

function Chips({ options, value, onChange, disabled, num }: { options: string[]; value: string; onChange: (v: string) => void; disabled?: boolean; num?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === o ? "" : o)}
          className={clsx("chip h-9 px-3 text-[13px]", num && "num", value === o ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}
        >
          {bidi(num && o !== "الكل" ? `فئة ${o}` : o)}
        </button>
      ))}
    </div>
  );
}

function ReturnModal({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (note: string) => void }) {
  return open ? <ReturnForm onClose={onClose} onSend={onSend} /> : null;
}

function ReturnForm({ onClose, onSend }: { onClose: () => void; onSend: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title="إرجاع التمرين للتعديل"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className="btn-primary" onClick={() => onSend(note.trim())} disabled={!note.trim()}>
            <Undo2 size={16} /> إرجاع
          </button>
        </>
      }
    >
      <Field label="الملاحظة للمدرب">
        <textarea className="field min-h-[110px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: كبّر المساحة إلى 25×30 وخلّ كل لاعب معه كرة" autoFocus />
      </Field>
    </Modal>
  );
}

/* ---------- add a drill to the training calendar ---------- */

export function nextTrainingDay(from: string, days: number[]) {
  let d = parseISO(from);
  for (let i = 0; i < 14; i++) {
    const iso = format(d, "yyyy-MM-dd");
    if (!days.length || isTrainingDay(iso, days)) return iso;
    d = addDays(d, 1);
  }
  return from;
}

function AddToCalendarModal(props: { open: boolean; onClose: () => void; drillId: string; defaultDuration: number | null; branches: Branch[]; groups: Group[]; today: string; onDone: (label: string) => void }) {
  return props.open ? <AddToCalendarForm {...props} /> : null;
}

function AddToCalendarForm({ onClose, drillId, defaultDuration, branches, groups, today, onDone }: { onClose: () => void; drillId: string; defaultDuration: number | null; branches: Branch[]; groups: Group[]; today: string; onDone: (label: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const branch = branches.find((b) => b.id === branchId);
  const [date, setDate] = useState(() => nextTrainingDay(today, branches[0]?.training_days ?? []));
  const [groupId, setGroupId] = useState("");
  const [dur, setDur] = useState(defaultDuration ? String(defaultDuration) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const training = branch ? isTrainingDay(date, branch.training_days) : true;

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { count } = await supabase.from("plan_items").select("id", { count: "exact", head: true }).eq("item_date", date);
    const n = parseInt(dur, 10);
    const { error } = await supabase.from("plan_items").insert({
      item_date: date,
      branch_id: branchId || null,
      group_id: groupId || null,
      kind: "drill",
      drill_id: drillId,
      duration_min: Number.isFinite(n) && n > 0 ? n : null,
      position: count ?? 0,
    });
    setBusy(false);
    if (error) return setErr("تعذّرت الإضافة — تحقق من الاتصال");
    onDone(format(parseISO(date), "dd/MM"));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="إضافة للتقويم"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button form="cal-add" className="btn-primary" disabled={busy || !date}>
            <CalendarPlus size={17} /> {busy ? "جارٍ…" : "إضافة"}
          </button>
        </>
      }
    >
      <form id="cal-add" onSubmit={add} className="grid gap-4 sm:grid-cols-2">
        <Field label="اليوم">
          <input type="date" className="field num" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        {branches.length > 1 ? (
          <Field label="الفرع">
            <select className="field" value={branchId} onChange={(e) => { setBranchId(e.target.value); setGroupId(""); }}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="المدة (دقيقة)">
            <input className="field num" dir="ltr" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="15" />
          </Field>
        )}
        <Field label="الفئة" className="sm:col-span-2" group>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setGroupId("")} className={clsx("chip h-9 px-3 text-[13px]", !groupId ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
              كل الفئات
            </button>
            {groups
              .filter((g) => !branchId || g.branch_id === branchId)
              .map((g) => (
                <button key={g.id} type="button" onClick={() => setGroupId(g.id)} className={clsx("chip h-9 px-3 text-[13px]", groupId === g.id ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
                  {bidi(g.name)}
                </button>
              ))}
          </div>
        </Field>
        {branches.length > 1 && (
          <Field label="المدة (دقيقة)">
            <input className="field num" dir="ltr" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="15" />
          </Field>
        )}
        {!training && <p className="sm:col-span-2 text-[12.5px] font-bold text-navy-900 bg-gold-100 rounded-xl px-3 py-2">هذا اليوم مو يوم تدريب للفرع — تقدر تضيفه عادي.</p>}
        {err && <p className="sm:col-span-2 text-[13px] font-bold text-error">{err}</p>}
      </form>
    </Modal>
  );
}

