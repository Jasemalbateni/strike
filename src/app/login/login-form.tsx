"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/types";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("inactive") ? "هذا الحساب موقّف. تواصل مع إدارة الأكاديمية." : null,
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) {
      setLoading(false);
      setError("اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }
    const next = params.get("next");
    router.replace(next && next.startsWith("/") ? next : "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 sm:p-7 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-navy">اسم المستخدم</span>
        <input
          className="field en text-[17px] tracking-wide"
          dir="ltr"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-navy">كلمة المرور</span>
        <div className="relative">
          <input
            className="field en text-[17px] tracking-wide pe-11"
            dir="ltr"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            className="absolute inset-y-0 end-0 px-3 text-ink-2 hover:text-navy"
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-error-100 text-error text-sm font-bold px-3.5 py-2.5">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary mt-1 h-12 text-[16px]">
        <LogIn size={18} />
        {loading ? "جارٍ الدخول…" : "دخول"}
      </button>
    </form>
  );
}
