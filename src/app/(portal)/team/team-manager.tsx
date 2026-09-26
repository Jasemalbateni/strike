"use client";

import { useState, type FormEvent } from "react";
import { Plus, KeyRound, Trash2, Megaphone, ShieldCheck, Ban, Check, X } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS, type Profile, type StaffRole } from "@/lib/types";

const ROLES = Object.keys(ROLE_LABELS) as StaffRole[];

export default function TeamManager({ initial, meId }: { initial: Profile[]; meId: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Profile[]>(initial);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // create form
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("coach");
  const [mk, setMk] = useState(false);

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
    setOpen(false);
    reload();
  }

  async function patch(id: string, values: Partial<Profile>) {
    setRows((r) => r.map((p) => (p.id === id ? { ...p, ...values } : p)));
    const { error } = await supabase.from("profiles").update(values).eq("id", id);
    if (error) reload();
  }

  async function resetPassword(p: Profile) {
    const pw = window.prompt(`كلمة مرور جديدة لـ ${p.full_name} (8 أحرف على الأقل):`);
    if (!pw) return;
    const { error } = await supabase.rpc("admin_set_password", { p_user_id: p.id, p_password: pw });
    alert(error ? "تعذر تغيير كلمة المرور" : "تم تغيير كلمة المرور");
  }

  async function remove(p: Profile) {
    if (!window.confirm(`حذف حساب ${p.full_name} نهائياً؟`)) return;
    const { error } = await supabase.rpc("admin_delete_user", { p_user_id: p.id });
    if (error) alert("تعذر الحذف");
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
            <select className="field" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
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
          {err && <p className="sm:col-span-2 rounded-xl bg-error-100 text-error text-sm font-bold px-3.5 py-2.5">{err}</p>}
          <div className="sm:col-span-2 flex justify-end">
            <button className="btn-primary" disabled={busy}>
              إنشاء الحساب
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-[15px]">
          <thead className="bg-navy text-white text-sm">
            <tr>
              <th className="text-start px-4 py-3 font-bold">الاسم</th>
              <th className="text-start px-4 py-3 font-bold hidden sm:table-cell">الدور</th>
              <th className="text-center px-4 py-3 font-bold">التسويق</th>
              <th className="text-center px-4 py-3 font-bold">الحالة</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const me = p.id === meId;
              return (
                <tr key={p.id} className={clsx(i % 2 ? "bg-silver-100/70" : "bg-white", !p.is_active && "opacity-60")}>
                  <td className="px-4 py-3">
                    <div className="font-bold text-navy">
                      {p.full_name} {me && <span className="chip bg-ice-100 text-navy ms-1">أنت</span>}
                    </div>
                    <div className="en text-ink-2 text-xs" dir="ltr">
                      @{p.username}
                    </div>
                    <div className="sm:hidden mt-1">
                      <RoleSelect p={p} disabled={me} onChange={(role) => patch(p.id, { role })} />
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <RoleSelect p={p} disabled={me} onChange={(role) => patch(p.id, { role })} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.role === "owner" ? (
                      <ShieldCheck size={18} className="inline text-gold" />
                    ) : (
                      <button
                        onClick={() => patch(p.id, { marketing_access: !p.marketing_access })}
                        className={clsx(
                          "inline-grid h-8 w-8 place-items-center rounded-full border transition",
                          p.marketing_access ? "bg-ice text-navy-900 border-ice" : "bg-white text-silver border-silver-200 hover:border-ice",
                        )}
                        title="صلاحية مركز التسويق"
                      >
                        {p.marketing_access ? <Check size={16} /> : <Megaphone size={15} />}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      disabled={me}
                      onClick={() => patch(p.id, { is_active: !p.is_active })}
                      className={clsx("chip", p.is_active ? "bg-ice-100 text-navy" : "bg-silver-200 text-ink-2")}
                    >
                      {p.is_active ? "نشط" : "موقّف"}
                    </button>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => resetPassword(p)} className="p-2 rounded-lg text-ink-2 hover:bg-navy-50 hover:text-navy" title="تغيير كلمة المرور">
                        <KeyRound size={17} />
                      </button>
                      {!me && (
                        <button onClick={() => remove(p)} className="p-2 rounded-lg text-ink-2 hover:bg-error-100 hover:text-error" title="حذف">
                          <Trash2 size={17} />
                        </button>
                      )}
                      {me && <span className="p-2 text-silver"><Ban size={17} /></span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleSelect({ p, disabled, onChange }: { p: Profile; disabled: boolean; onChange: (r: StaffRole) => void }) {
  return (
    <select
      className="rounded-lg border border-silver-200 bg-white px-2 py-1 text-sm font-bold text-navy disabled:bg-transparent disabled:border-transparent"
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
