"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SettingsForm({ fullName, username }: { fullName: string; username: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(fullName);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    const { error } = await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", user.id);
    setBusy(false);
    setNameMsg(error ? "تعذر الحفظ" : "تم الحفظ");
    if (!error) router.refresh();
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (pw1.length < 8) return setPwMsg({ ok: false, text: "كلمة المرور لازم تكون 8 أحرف على الأقل" });
    if (pw1 !== pw2) return setPwMsg({ ok: false, text: "كلمتا المرور غير متطابقتين" });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);
    if (error) return setPwMsg({ ok: false, text: "تعذر تغيير كلمة المرور" });
    setPw1("");
    setPw2("");
    setPwMsg({ ok: true, text: "تم تغيير كلمة المرور" });
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={saveName} className="card p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-navy font-extrabold">
          <UserRound size={18} className="text-ice" /> الملف الشخصي
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-navy">الاسم الكامل</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-navy">اسم المستخدم</span>
          <input className="field en bg-silver-100" dir="ltr" value={username} disabled />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy || name.trim() === fullName}>
            حفظ
          </button>
          {nameMsg && <span className="text-sm text-ink-2">{nameMsg}</span>}
        </div>
      </form>

      <form onSubmit={savePassword} className="card p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-navy font-extrabold">
          <KeyRound size={18} className="text-ice" /> تغيير كلمة المرور
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-navy">كلمة المرور الجديدة</span>
          <input className="field en" dir="ltr" type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-navy">تأكيد كلمة المرور</span>
          <input className="field en" dir="ltr" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy || !pw1}>
            تغيير
          </button>
          {pwMsg && <span className={`text-sm font-bold ${pwMsg.ok ? "text-ice-600" : "text-error"}`}>{pwMsg.text}</span>}
        </div>
      </form>
    </div>
  );
}
