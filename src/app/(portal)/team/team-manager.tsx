"use client";

import { useState, type FormEvent } from "react";
import { Plus, KeyRound, Trash2, Megaphone, ShieldCheck, Ban, Check, X, ClipboardCheck, IdCard, PenTool, CalendarDays } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field } from "@/components/ui";
import { useConfirm } from "@/components/confirm";

import { DEFAULT_ACCESS, PAGE_LABELS, ROLE_LABELS, type PageKey, type Profile, type StaffRole } from "@/lib/types";

const PAGES: { key: PageKey; icon: React.ReactNode }[] = [
  { key: "attendance", icon: <ClipboardCheck size={15} /> },
  { key: "players", icon: <IdCard size={15} /> },
  { key: "drills", icon: <PenTool size={15} /> },
  { key: "calendar", icon: <CalendarDays size={15} /> },
];

const ROLES = Object.keys(ROLE_LABELS) as StaffRole[];

export default function TeamManager({ initial, meId }: { initial: Profile[]; meId: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Profile[]>(initial);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const [pwFor, setPwFor] = useState<Profile | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // create form
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("coach");
  const [mk, setMk] = useState(false);
  const [access, setAccess] = useState<PageKey[]>(DEFAULT_ACCESS.coach);

  async function reload() {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    if (data) setRows(data as Profile[]);
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const { error } = await supabase.rpc("admin_create_user", {
      p_username: username.trim().toLowerCase(),
      p_password: password,
      p_full_name: fullName.trim(),
      p_role: role,
      p_marketing_access: mk,
      p_access: access,
    });
    setBusy(false);
    if (error) {
      setErr(
        error.message.includes("taken")
          ? "اسم المستخدم مستخدم من قبل"
          : error.message.includes("invalid username")
            ? "اسم المستخدم: حروف إنجليزية صغيرة وأرقام و _ . فقط (3–32)"
            : error.message.includes("short")
              ? "كلمة المرور 8 أحرف على الأقل"
              : "تعذر إنشاء الحساب",
      );
      return;
    }
    setFullName("");
    setUsername("");
    setPassword("");
    setRole("coach");
    setMk(false);
    setAccess(DEFAULT_ACCESS.coach);
    setOpen(false);
    reload();
  }

  async function patch(id: string, values: Partial<Profile>) {
    setRows((r) => r.map((p) => (p.id === id ? { ...p, ...values } : p)));
    const { error } = await supabase.from("profiles").update(values).eq("id", id);
    if (error) reload();
  }

  function openReset(p: Profile) {
    setPwValue("");
    setPwMsg(null);
    setPwFor(p);
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (!pwFor) return;
    if (pwValue.length < 8) return setPwMsg({ ok: false, text: "كلمة المرور 8 أحرف على الأقل" });
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_password", { p_user_id: pwFor.id, p_password: pwValue });
    setBusy(false);
    if (error) return setPwMsg({ ok: false, text: "تعذر تغيير كلمة المرور" });
    setPwFor(null);
    showFlash(`تم تغيير كلمة مرور ${pwFor.full_name}`);
  }

  function showFlash(text: string) {
    setFlash(text);
    setTimeout(() => setFlash(null), 3000);
  }

  async function remove(p: Profile) {
    if (!(await confirm({ title: `حذف حساب ${p.full_name}؟`, message: "ما يقدر يدخل بعدها، وكل ما أنشأه يبقى باسمه.", confirmText: "حذف الحساب" }))) return;
    const { error } = await supabase.rpc("admin_delete_user", { p_user_id: p.id });
    showFlash(error ? "تعذر الحذف" : `تم حذف حساب ${p.full_name}`);
    reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="text-ink-2 text-sm">
          <span className="num font-bold text-navy text-base">{rows.length}</span> حساب
        </div>
        <button className="btn-primary" onClick={() => setOpen((o) => !o)}>
          {open ? <X size={18} /> : <Plus size={18} />}
          {open ? "إغلاق" : "حساب جديد"}
        </button>
      </div>

      {open && (
        <form onSubmit={createUser} className="card p-5 grid gap-4 sm:grid-cols-2 fade-up">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-sm font-bold text-navy">الاسم الكامل</span>
            <input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-navy">اسم المستخدم</span>
            <input className="field en" dir="ltr" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="e.g. ahmad" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-navy">كلمة المرور المؤقتة</span>
            <input className="field en" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-navy">الدور</span>
            <select
              className="field"
              value={role}
              onChange={(e) => {
                const r = e.target.value as StaffRole;
                setRole(r);
                setAccess(DEFAULT_ACCESS[r]);
                if (r === "owner") setMk(true);
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3 self-end rounded-xl border border-silver-200 px-3.5 py-2.5 cursor-pointer">
            <input type="checkbox" checked={mk} onChange={(e) => setMk(e.target.checked)} className="h-4 w-4 accent-[#1C2D5A]" />
            <span className="text-sm font-bold text-navy flex items-center gap-1.5">
              <Megaphone size={16} className="text-ice" /> صلاحية مركز التسويق
            </span>
          </label>
          <div className="sm:col-span-2">
            <span className="text-sm font-bold text-navy">الصفحات اللي تظهر له</span>
            <div className="mt-1.5">
              <AccessChips value={role === "owner" ? DEFAULT_ACCESS.owner : access} disabled={role === "owner"} onToggle={(k) => setAccess((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]))} />
            </div>
          </div>
          {err && <p className="sm:col-span-2 rounded-xl bg-error-100 text-error text-sm font-bold px-3.5 py-2.5">{err}</p>}
          <div className="sm:col-span-2 flex justify-end">
            <button className="btn-primary" disabled={busy}>
              إنشاء الحساب
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-3">
        {rows.map((p) => {
          const me = p.id === meId;
          const owner = p.role === "owner";
          return (
            <div key={p.id} className={clsx("card p-4", !p.is_active && "opacity-60")}>
              <div className="flex items-center gap-x-3 gap-y-2.5 flex-wrap">
                <div className="min-w-0 flex-1 order-1">
                  <div className="font-bold text-navy text-[16px] truncate">
                    {p.full_name} {me && <span className="chip bg-ice-100 text-navy ms-1">أنت</span>}
                  </div>
                  <div className="en text-ink-2 text-xs text-right" dir="ltr">
                    @{p.username}
                  </div>
                </div>
                <div className="order-3 sm:order-2 w-full sm:w-auto flex items-center gap-2">
                  <RoleSelect p={p} disabled={me} onChange={(role) => patch(p.id, { role, ...(role === "owner" ? { marketing_access: true } : {}) })} />
                  <button
                    disabled={me}
                    onClick={() => patch(p.id, { is_active: !p.is_active })}
                    className={clsx("chip h-9 px-3 shrink-0", p.is_active ? "bg-ice-100 text-navy" : "bg-silver-200 text-ink-2")}
                    title={me ? "" : p.is_active ? "اضغط لإيقاف الحساب" : "اضغط لتفعيل الحساب"}
                  >
                    {p.is_active ? "نشط" : "موقّف"}
                  </button>
                </div>
                <div className="order-2 sm:order-3 flex gap-1">
                  <button onClick={() => openReset(p)} className="h-9 w-9 grid place-items-center rounded-lg text-ink-2 hover:bg-navy-50 hover:text-navy" title="تغيير كلمة المرور" aria-label="تغيير كلمة المرور">
                    <KeyRound size={17} />
                  </button>
                  {!me ? (
                    <button onClick={() => remove(p)} className="h-9 w-9 grid place-items-center rounded-lg text-ink-2 hover:bg-error-100 hover:text-error" title="حذف" aria-label="حذف">
                      <Trash2 size={17} />
                    </button>
                  ) : (
                    <span className="h-9 w-9 grid place-items-center text-silver">
                      <Ban size={17} />
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-silver-200 flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-bold text-ink-2 me-1">الصفحات:</span>
                {owner ? (
                  <span className="chip bg-gold-100 text-navy-900 h-8 px-3">
                    <ShieldCheck size={14} /> كل الصفحات (مالك)
                  </span>
                ) : (
                  <>
                    <AccessChips
                      value={p.access ?? []}
                      onToggle={(k) => {
                        const cur = p.access ?? [];
                        patch(p.id, { access: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] });
                      }}
                    />
                    <button
                      onClick={() => patch(p.id, { marketing_access: !p.marketing_access })}
                      className={clsx("chip h-8 px-3 gap-1.5 border", p.marketing_access ? "bg-navy text-white border-navy" : "bg-white text-ink-2 border-silver-200 hover:border-ice")}
                      aria-pressed={p.marketing_access}
                    >
                      {p.marketing_access ? <Check size={14} /> : <Megaphone size={14} />} مركز التسويق
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {flash && <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] md:bottom-6 inset-x-4 md:inset-x-auto md:end-6 z-[60] rounded-xl bg-navy text-white px-4 py-2.5 text-sm font-bold shadow-[var(--shadow-pop)] fade-up text-center">{flash}</div>}

      <Modal
        open={!!pwFor}
        onClose={() => setPwFor(null)}
        title={pwFor ? `كلمة مرور جديدة — ${pwFor.full_name}` : ""}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setPwFor(null)}>
              إلغاء
            </button>
            <button form="pw-form" className="btn-primary" disabled={busy}>
              تغيير
            </button>
          </>
        }
      >
        <form id="pw-form" onSubmit={submitReset} className="flex flex-col gap-3">
          <Field label="كلمة المرور المؤقتة (أرسلها للموظف وهو يغيّرها من الإعدادات)">
            <input className="field en" dir="ltr" autoComplete="new-password" value={pwValue} onChange={(e) => setPwValue(e.target.value)} minLength={8} required />
          </Field>
          {pwMsg && <p className={`text-sm font-bold ${pwMsg.ok ? "text-ice-600" : "text-error"}`}>{pwMsg.text}</p>}
        </form>
      </Modal>
    </div>
  );
}

function AccessChips({ value, onToggle, disabled }: { value: PageKey[]; onToggle: (k: PageKey) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PAGES.map(({ key, icon }) => {
        const on = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(key)}
            aria-pressed={on}
            className={clsx("chip h-8 px-3 gap-1.5 border transition", on ? "bg-navy text-white border-navy" : "bg-white text-ink-2 border-silver-200 hover:border-ice", disabled && "opacity-70")}
          >
            {on ? <Check size={14} /> : icon} {PAGE_LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}

function RoleSelect({ p, disabled, onChange }: { p: Profile; disabled: boolean; onChange: (r: StaffRole) => void }) {
  return (
    <select
      className="h-9 rounded-lg border border-silver-200 bg-white px-2 text-sm font-bold text-navy disabled:bg-transparent disabled:border-transparent"
      value={p.role}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as StaffRole)}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}
