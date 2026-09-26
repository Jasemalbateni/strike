"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Megaphone, Settings, Users, LogOut, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";

type NavItem = { href: string; label: string; icon: LucideIcon };

export default function Shell({
  profile,
  showMarketing,
  isOwner,
  children,
}: {
  profile: { full_name: string; username: string };
  showMarketing: boolean;
  isOwner: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const nav: NavItem[] = [
    { href: "/", label: "الرئيسية", icon: Home },
    ...(showMarketing ? [{ href: "/marketing", label: "مركز التسويق", icon: Megaphone }] : []),
    ...(isOwner ? [{ href: "/team", label: "الفريق", icon: Users }] : []),
    { href: "/settings", label: "الإعدادات", icon: Settings },
  ];

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const initials = profile.full_name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");

  return (
    <div className="min-h-dvh flex">
      {/* sidebar (desktop) */}
      <aside className="hidden md:flex w-[248px] shrink-0 flex-col bg-navy text-white sticky top-0 h-dvh">
        <div className="px-5 pt-6 pb-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/strike-logo-light.svg" alt="STRIKE" className="h-11 w-auto" />
          <div className="leading-tight">
            <div className="en font-bold text-[20px] tracking-[0.12em]">STRIKE</div>
            <div className="text-silver text-[11px]">بوابة الفريق</div>
          </div>
        </div>
        <div className="mx-5 h-px bg-white/10" />
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-bold transition",
                isActive(href) ? "bg-white/10 text-white" : "text-silver hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon size={19} className={isActive(href) ? "text-ice" : ""} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-4 pb-5">
          <div className="rounded-2xl bg-white/5 p-3 flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-ice text-navy-900 grid place-items-center font-extrabold">
              {initials}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="font-bold truncate">{profile.full_name}</div>
              <div className="en text-silver text-xs truncate" dir="ltr">
                @{profile.username}
              </div>
            </div>
            <button onClick={signOut} title="تسجيل الخروج" className="text-silver hover:text-white p-1.5 rounded-lg hover:bg-white/10">
              <LogOut size={18} />
            </button>
          </div>
          <p className="philosophy mt-4 text-center text-[10.5px] text-silver/60">لا طوابير · لا لفات · لا محاضرات</p>
        </div>
      </aside>

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 bg-navy text-white px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/strike-logo-light.svg" alt="STRIKE" className="h-8 w-auto" />
            <span className="en font-bold tracking-[0.12em]">STRIKE</span>
          </div>
          <button onClick={signOut} className="text-silver p-2 -me-2" aria-label="تسجيل الخروج">
            <LogOut size={20} />
          </button>
        </header>

        <main className="flex-1 pb-24 md:pb-8">{children}</main>

        {/* mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-silver-200 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 flex">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex-1 flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-bold",
                isActive(href) ? "text-navy" : "text-ink-2",
              )}
            >
              <Icon size={21} className={isActive(href) ? "text-ice" : ""} />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
