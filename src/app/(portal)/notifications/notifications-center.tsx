"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Bell, Send, Check, CheckCheck, Trash2, MessageCircle, Globe, Users, ArrowLeft, Clock, Phone } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/confirm";
import { Field, EmptyState, Avatar } from "@/components/ui";
import { CHANNELS, KINDS, ago, kindOf, normalizePhone, waLink, type NotifChannel, type NotifKind, type Notification } from "@/lib/notifications";

export type Recipient = { id: string; full_name: string; username: string; phone: string | null; role: string };

const todayKW = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const KIND_TONE: Record<NotifKind, string> = {
  late: "bg-gold/20 text-[#8a6a00]",
  absence: "bg-error-100 text-error",
  drill_reminder: "bg-ice-50 text-ice-600",
  session_change: "bg-navy/10 text-navy",
  general: "bg-silver-100 text-ink-2",
};

export default function NotificationsCenter({
  meId,
  isOwner,
  initialMine,
  staff: initialStaff,
  initialSent,
}: {
  meId: string;
  isOwner: boolean;
  initialMine: Notification[];
  staff: Recipient[];
  initialSent: Notification[];
}) {
  const [tab, setTab] = useState<"send" | "sent" | "mine">(isOwner ? "send" : "mine");
  const [staff, setStaff] = useState(initialStaff);
  const [sent, setSent] = useState(initialSent);
  const unreadMine = initialMine.filter((n) => !n.read_at).length;

  if (!isOwner) return <MyList meId={meId} initial={initialMine} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5 p-1 rounded-2xl bg-silver-100 w-fit max-w-full overflow-x-auto">
        {(
          [
            ["send", "إرسال تنبيه", <Send key="s" size={16} />],
            ["sent", `المرسلة (${sent.length})`, <CheckCheck key="c" size={16} />],
            ["mine", unreadMine ? `تنبيهاتي (${unreadMine})` : "تنبيهاتي", <Bell key="b" size={16} />],
          ] as const
        ).map(([k, label, icon]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx("h-10 px-4 rounded-xl text-[14px] font-bold flex items-center gap-2 whitespace-nowrap transition", tab === k ? "bg-white text-navy shadow-sm" : "text-ink-2 hover:text-navy")}>
            {icon}
            {label}
          </button>
        ))}
      </div>

      {tab === "send" && (
        <SendForm
          staff={staff}
          onPhoneSaved={(id, phone) => setStaff((s) => s.map((p) => (p.id === id ? { ...p, phone } : p)))}
          onSent={(rows) => setSent((s) => [...rows, ...s])}
          onUpdate={(n) => setSent((s) => s.map((x) => (x.id === n.id ? n : x)))}
        />
      )}
      {tab === "sent" && <SentList rows={sent} staff={staff} onChange={setSent} />}
      {tab === "mine" && <MyList meId={meId} initial={initialMine} />}
    </div>
  );
}

/* ---------------- send ---------------- */

function SendForm({
  staff,
  onPhoneSaved,
  onSent,
  onUpdate,
}: {
  staff: Recipient[];
  onPhoneSaved: (id: string, phone: string) => void;
  onSent: (rows: Notification[]) => void;
  onUpdate: (n: Notification) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [to, setTo] = useState<string[]>([]);
  const [kind, setKind] = useState<NotifKind>("late");
  const [date, setDate] = useState(todayKW);
  const [title, setTitle] = useState<string | null>(null); // null = follow the template
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<NotifChannel>("site");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Notification[] | null>(null);
  const [phones, setPhones] = useState<Record<string, string>>({});

  const k = kindOf(kind);
  const autoTitle = k.title(k.needsDate ? date : null);
  const finalTitle = (title ?? autoTitle).trim();
  const wantsWA = channel !== "site";
  const chosen = staff.filter((p) => to.includes(p.id));
  const missingPhone = wantsWA ? chosen.filter((p) => !normalizePhone(p.phone)) : [];

  function toggle(id: string) {
    setTo((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  }

  async function savePhone(p: Recipient) {
    const v = (phones[p.id] ?? "").trim();
    if (!normalizePhone(v)) return;
    const { error } = await supabase.from("profiles").update({ phone: v }).eq("id", p.id);
    if (!error) onPhoneSaved(p.id, v);
  }

  async function markWA(n: Notification) {
    const { data } = await supabase.from("notifications").update({ whatsapp_sent_at: new Date().toISOString() }).eq("id", n.id).select("*").single();
    if (data) {
      onUpdate(data as Notification);
      setDone((d) => d?.map((x) => (x.id === n.id ? (data as Notification) : x)) ?? d);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!to.length) return setErr("اختر شخص واحد على الأقل");
    if (!finalTitle) return setErr("اكتب عنوان التنبيه");
    if (missingPhone.length) return setErr(`أضف رقم واتساب لـ ${missingPhone.map((p) => p.full_name).join("، ")}`);

    // one recipient on WhatsApp: open it right away (inside the click, so the browser allows it)
    const single = wantsWA && chosen.length === 1 ? chosen[0] : null;
    if (single) window.open(waLink(single.phone!, finalTitle, body.trim()), "_blank", "noopener");

    setBusy(true);
    const now = new Date().toISOString();
    const rows = chosen.map((p) => ({
      recipient_id: p.id,
      kind,
      title: finalTitle,
      body: body.trim(),
      ref_date: k.needsDate ? date : null,
      link: k.link ?? null,
      channel,
      whatsapp_sent_at: single ? now : null,
    }));
    const { data, error } = await supabase.from("notifications").insert(rows).select("*");
    setBusy(false);
    if (error || !data) return setErr("تعذر الإرسال — تحقق من الاتصال");
    onSent(data as Notification[]);
    setDone(data as Notification[]);
    setTo([]);
    setBody("");
    setTitle(null);
  }

  if (done) {
    const waPending = done.filter((n) => n.channel !== "site");
    return (
      <div className="card p-5 sm:p-6 flex flex-col gap-4 max-w-2xl fade-up">
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 rounded-full bg-ice text-navy-900 grid place-items-center">
            <Check size={22} />
          </span>
          <div>
            <div className="font-extrabold text-navy text-[17px]">تم إرسال التنبيه</div>
            <div className="text-ink-2 text-[13.5px]">
              {done[0].channel === "whatsapp" ? "محفوظ في سجل المرسلة" : `بيظهر لـ ${done.length === 1 ? nameOf(staff, done[0].recipient_id) : `${done.length} أشخاص`} أول ما يدخل حسابه`}
            </div>
          </div>
        </div>
        {waPending.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-[13px] font-bold text-navy">{waPending.length > 1 ? "اضغط على كل اسم ليفتح واتساب برسالة جاهزة، ثم اضغط إرسال:" : "واتساب:"}</div>
            {waPending.map((n) => {
              const p = staff.find((s) => s.id === n.recipient_id);
              return (
                <a
                  key={n.id}
                  href={p?.phone ? waLink(p.phone, n.title, n.body) : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => markWA(n)}
                  className={clsx("flex items-center gap-3 rounded-xl border px-3.5 py-2.5 font-bold text-[14px] transition", n.whatsapp_sent_at ? "border-silver-200 bg-silver-100/60 text-ink-2" : "border-[#25D366] text-navy hover:bg-[#25D366]/10")}
                >
                  <MessageCircle size={18} className="text-[#25D366]" />
                  <span className="flex-1">{p?.full_name ?? "—"}</span>
                  <span className="text-[12px]">{n.whatsapp_sent_at ? "فُتح ✓" : "فتح واتساب"}</span>
                </a>
              );
            })}
          </div>
        )}
        <button className="btn-outline w-fit" onClick={() => setDone(null)}>
          <Send size={16} /> تنبيه جديد
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="card p-4 sm:p-6 grid gap-5 lg:grid-cols-[1fr_340px] items-start">
      <div className="flex flex-col gap-4 min-w-0">
        <Field label="إلى مين؟" group>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTo(to.length === staff.length ? [] : staff.map((p) => p.id))} className={clsx("chip h-10 px-3.5 text-[14px] gap-1.5", to.length === staff.length && staff.length ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
              <Users size={15} /> الكل
            </button>
            {staff.map((p) => (
              <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={to.includes(p.id)} className={clsx("chip h-10 ps-1.5 pe-3.5 text-[14px] gap-2", to.includes(p.id) ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
                <Avatar name={p.full_name} size={26} tone={to.includes(p.id) ? "ice" : "navy"} />
                {p.full_name}
              </button>
            ))}
          </div>
        </Field>

        <Field label="نوع التنبيه" group>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((x) => (
              <button key={x.value} type="button" onClick={() => setKind(x.value)} className={clsx("chip h-9 px-3.5 text-[13.5px]", kind === x.value ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
                {x.label}
              </button>
            ))}
          </div>
        </Field>

        {k.needsDate && (
          <Field label="تاريخ الحصة">
            <input type="date" dir="ltr" className="field num max-w-[220px]" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} required />
          </Field>
        )}

        <Field label="العنوان">
          <input className="field" value={title ?? autoTitle} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: اجتماع المدربين يوم الخميس" required />
        </Field>
        <Field label="تفاصيل (اختياري)">
          <textarea className="field min-h-[96px] py-2 leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} placeholder="أي تفاصيل إضافية تبي توصله" />
        </Field>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-6">
        <Field label="يوصل عن طريق" group>
          <div className="flex flex-col gap-2">
            {CHANNELS.map((c) => (
              <button key={c.value} type="button" onClick={() => setChannel(c.value)} className={clsx("rounded-xl border px-3.5 py-2.5 text-start flex items-center gap-3 transition", channel === c.value ? "border-ice ring-2 ring-ice/40 bg-ice-50" : "border-silver-200 bg-white hover:border-ice")}>
                <span className="flex gap-1 text-navy">
                  {c.value !== "whatsapp" && <Globe size={17} />}
                  {c.value !== "site" && <MessageCircle size={17} className="text-[#25D366]" />}
                </span>
                <span className="flex-1">
                  <span className="block font-bold text-navy text-[14px]">{c.label}</span>
                  <span className="block text-ink-2 text-[12px]">{c.hint}</span>
                </span>
                <span className={clsx("h-5 w-5 rounded-full border-2 grid place-items-center", channel === c.value ? "border-ice bg-ice" : "border-silver-200")}>{channel === c.value && <Check size={12} className="text-navy-900" />}</span>
              </button>
            ))}
          </div>
        </Field>

        {missingPhone.length > 0 && (
          <div className="rounded-xl bg-gold/15 p-3 flex flex-col gap-2">
            <div className="text-[13px] font-bold text-navy flex items-center gap-1.5">
              <Phone size={14} /> رقم الواتساب ناقص — يتحفظ في حسابه للمرات الجاية
            </div>
            {missingPhone.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-navy w-20 truncate">{p.full_name}</span>
                <input className="field num h-10 flex-1" dir="ltr" inputMode="tel" placeholder="9XXXXXXX" value={phones[p.id] ?? ""} onChange={(e) => setPhones((m) => ({ ...m, [p.id]: e.target.value }))} onBlur={() => savePhone(p)} />
              </label>
            ))}
          </div>
        )}

        {/* preview */}
        <div className="rounded-2xl bg-navy text-white p-3.5 flex items-start gap-3">
          <span className="h-9 w-9 shrink-0 rounded-xl bg-gold text-navy-900 grid place-items-center">
            <Bell size={17} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] text-silver font-bold">معاينة</div>
            <div className="font-bold text-[14px] leading-snug">{finalTitle || "عنوان التنبيه"}</div>
            {body.trim() && <div className="text-silver text-[12.5px] mt-0.5 whitespace-pre-line line-clamp-3">{body.trim()}</div>}
          </div>
        </div>

        {err && <p className="text-error text-[13px] font-bold">{err}</p>}
        <button className="btn-primary h-12" disabled={busy}>
          <Send size={17} /> {busy ? "جارٍ الإرسال…" : to.length > 1 ? `إرسال لـ ${to.length} أشخاص` : "إرسال"}
        </button>
      </div>
    </form>
  );
}

const nameOf = (staff: Recipient[], id: string) => staff.find((p) => p.id === id)?.full_name ?? "—";

/* ---------------- sent ---------------- */

function SentList({ rows, staff, onChange }: { rows: Notification[]; staff: Recipient[]; onChange: (r: Notification[]) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  if (!rows.length) return <EmptyState title="ما أرسلت أي تنبيه بعد" hint="من تبويب «إرسال تنبيه» تقدر ترسل لمدرب واحد أو للكل." />;

  async function remove(n: Notification) {
    if (!(await confirm({ title: "حذف هذا التنبيه؟", message: `${nameOf(staff, n.recipient_id)} — ${n.title}`, confirmText: "حذف" }))) return;
    const { error } = await supabase.from("notifications").delete().eq("id", n.id);
    if (!error) onChange(rows.filter((x) => x.id !== n.id));
  }

  return (
    <div className="card divide-y divide-silver-200 overflow-hidden">
      {rows.map((n) => {
        const p = staff.find((s) => s.id === n.recipient_id);
        return (
          <div key={n.id} className="p-3.5 sm:px-4 flex items-start gap-3">
            <Avatar name={p?.full_name ?? "?"} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-bold text-navy text-[14px]">{p?.full_name ?? "حساب محذوف"}</span>
                <span className={clsx("chip text-[11.5px] px-2 py-0.5", KIND_TONE[n.kind])}>{kindOf(n.kind).label}</span>
                <span className="text-ink-2 text-[12px]">{ago(n.created_at)}</span>
              </div>
              <div className="text-navy text-[14px] mt-0.5">{n.title}</div>
              {n.body && <div className="text-ink-2 text-[13px] whitespace-pre-line line-clamp-2">{n.body}</div>}
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[12px] font-bold">
                {n.channel !== "whatsapp" &&
                  (n.read_at ? (
                    <span className="text-ice-600 flex items-center gap-1">
                      <CheckCheck size={14} /> قرأه {ago(n.read_at)}
                    </span>
                  ) : (
                    <span className="text-ink-2 flex items-center gap-1">
                      <Clock size={13} /> لم يقرأه بعد
                    </span>
                  ))}
                {n.channel !== "site" && (
                  <span className={clsx("flex items-center gap-1", n.whatsapp_sent_at ? "text-[#1da851]" : "text-ink-2")}>
                    <MessageCircle size={13} /> {n.whatsapp_sent_at ? "أُرسل واتساب" : "واتساب لم يُرسل"}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {normalizePhone(p?.phone) && (
                <a
                  href={waLink(p!.phone!, n.title, n.body)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={async () => {
                    if (n.channel === "site") return;
                    const { data } = await supabase.from("notifications").update({ whatsapp_sent_at: new Date().toISOString() }).eq("id", n.id).select("*").single();
                    if (data) onChange(rows.map((x) => (x.id === n.id ? (data as Notification) : x)));
                  }}
                  className="h-9 w-9 grid place-items-center rounded-lg text-[#1da851] hover:bg-[#25D366]/10"
                  aria-label="إرسال واتساب"
                  title="إرسال واتساب"
                >
                  <MessageCircle size={17} />
                </a>
              )}
              <button onClick={() => remove(n)} className="h-9 w-9 grid place-items-center rounded-lg text-ink-2 hover:bg-error-100 hover:text-error" aria-label="حذف">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- mine ---------------- */

function MyList({ meId, initial }: { meId: string; initial: Notification[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(initial);
  // what was unread when the page opened stays highlighted while it's open
  const [freshIds] = useState(() => new Set(initial.filter((n) => !n.read_at).map((n) => n.id)));

  useEffect(() => {
    if (!initial.some((n) => !n.read_at)) return;
    supabase.rpc("mark_notifications_read", { p_ids: null }).then(() => window.dispatchEvent(new Event("notifications:read")));
  }, [supabase, initial]);

  // live: new ones appear at the top
  useEffect(() => {
    const ch = supabase
      .channel(`notif-list-${meId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${meId}` }, (payload) => {
        const n = payload.new as Notification;
        if (n.channel === "whatsapp") return;
        freshIds.add(n.id);
        setRows((r) => [n, ...r.filter((x) => x.id !== n.id)]);
        supabase.rpc("mark_notifications_read", { p_ids: [n.id] }).then(() => window.dispatchEvent(new Event("notifications:read")));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) setRows((r) => r.filter((x) => x.id !== id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, meId, freshIds]);

  if (!rows.length) return <EmptyState title="ما عندك تنبيهات" hint="أي تنبيه يوصلك من الإدارة بيظهر هنا." />;
  return <NotificationCards rows={rows} freshIds={freshIds} />;
}

export function NotificationCards({ rows, freshIds }: { rows: Notification[]; freshIds?: Set<string> }) {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((n) => {
        const fresh = freshIds ? freshIds.has(n.id) : !n.read_at;
        return (
          <div key={n.id} className={clsx("card p-4 flex items-start gap-3 transition", fresh && "ring-2 ring-gold/70")}>
            <span className={clsx("h-10 w-10 shrink-0 rounded-xl grid place-items-center", fresh ? "bg-gold text-navy-900" : "bg-silver-100 text-ink-2")}>
              <Bell size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx("chip text-[11.5px] px-2 py-0.5", KIND_TONE[n.kind])}>{kindOf(n.kind).label}</span>
                {fresh && <span className="chip text-[11px] px-2 py-0.5 bg-gold text-navy-900">جديد</span>}
                <span className="text-ink-2 text-[12px] ms-auto">{ago(n.created_at)}</span>
              </div>
              <div className="font-bold text-navy text-[15px] mt-1 leading-snug">{n.title}</div>
              {n.body && <div className="text-ink-2 text-[13.5px] mt-1 whitespace-pre-line">{n.body}</div>}
              {n.link && (
                <Link href={n.link} className="btn-outline h-9 text-[13px] mt-2.5 w-fit">
                  {n.kind === "drill_reminder" ? "أنشئ ورقة التمرين" : "فتح"} <ArrowLeft size={15} />
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
