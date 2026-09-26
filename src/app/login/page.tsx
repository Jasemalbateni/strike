import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh flex items-center justify-center overflow-hidden bg-navy-900 px-4 py-10">
      {/* backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 500px at 85% -10%, rgba(77,168,255,0.28), transparent 60%), radial-gradient(700px 400px at 0% 110%, rgba(77,168,255,0.14), transparent 60%), linear-gradient(180deg,#1C2D5A 0%, #14213F 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />

      <div className="relative w-full max-w-[420px] fade-up">
        <div className="flex flex-col items-center gap-4 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/strike-logo-light.svg" alt="STRIKE" className="h-24 w-auto drop-shadow-[0_8px_24px_rgba(77,168,255,0.35)]" />
          <div className="text-center">
            <h1 className="display text-white text-[34px] leading-none">بوابة الفريق</h1>
            <p className="mt-2 text-silver text-sm">للدخول المصرّح به فقط · فريق أكاديمية سترايك</p>
          </div>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        <p className="philosophy mt-10 text-center text-silver/70 text-xs">
          لا طوابير · لا لفات · لا محاضرات
        </p>
      </div>
    </main>
  );
}
