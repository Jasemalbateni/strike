"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Megaphone, Settings, Users, LogOut, ClipboardCheck, IdCard, PenTool, CalendarDays, Ellipsis, X, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { ConfirmProvider } from "@/components/confirm";

type NavItem = { href: string; label: string; short?: string; icon: LucideIcon; phoneRank: number };

export type ShellAccess = { attendance: boolean; players: boolean; drills: boolean; calendar: boolean; marketing: boolean; team: boolean };

export default function Shell({ profile, access, children }: { profile: { full_name: string; username: string }; access: ShellAccess; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);

  // desktop order; phoneRank decides what makes the 5-slot bottom bar
  const nav: NavItem[] = [
    { href: "/", label: "الرئيسية", icon: Home, phoneRank: 0 },
    ...(access.attendance ? [{ href: "/attendance", label: "الحضور", icon: ClipboardCheck, phoneRank: 1 }] : []),
    ...(access.players ? [{ href: "/players", label: "اللاعبين", icon: IdCard, phoneRank: 4 }] : []),
    ...(access.drills ? [{ href: "/drills", label: "التمارين", icon: PenTool, phoneRank: 2 }] : []),
    ...(access.calendar ? [{ href: "/calendar", label: "التقويم", icon: CalendarDays, phoneRank: 3 }] : []),
    ...(access.marketing ? [{ href: "/marketing", label: "مركز التسويق", short: "التسويق", icon: Megaphone, phoneRank: 5 }] : []),
    ...(access.team ? [{ href: "/team", label: "الفريق", icon: Users, phoneRank: 6 }] : []),
  ];
  const byRank = [...nav].sort((a, b) => a.phoneRank - b.phoneRank);
  const phoneMain = byRank.length > 5 ? byRank.slice(0, 4) : byRank;
  const phoneMore = byRank.length > 5 ? byRank.slice(4) : [];

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const moreActive = phoneMore.some((n) => isActive(n.href)) || isActive("/settings");

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const initials = profile.full_name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");

  return (
    <ConfirmProvider>
      <div className="min-h-dvh flex">
        {/* sidebar: icon rail on tablets incl. iPad landscape (md), full on laptops (xl+) */}
        <aside className="hidden md:flex md:w-[76px] xl:w-[248px] shrink-0 flex-col bg-navy text-white sticky top-0 h-dvh transition-[width]">
          <div className="px-3 xl:px-5 pt-5 xl:pt-6 pb-4 flex items-center justify-center xl:justify-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/strike-logo-light.svg" alt="STRIKE" className="h-10 xl:h-11 w-auto" />
            <div className="leading-tight hidden xl:block">
              <div className="en font-bold text-[20px] tracking-[0.12em]">STRIKE</div>
              <div className="text-silver text-[11px]">بوابة الفريق</div>
            </div>
          </div>
          <div className="mx-4 xl:mx-5 h-px bg-white/10" />
          <nav className="flex-1 px-2.5 xl:px-3 py-4 flex flex-col gap-1">
            {[...nav, { href: "/settings", label: "الإعدادات", icon: Settings, phoneRank: 99 }].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                title={label}
                className={clsx(
                  "flex items-center justify-center xl:justify-start gap-3 rounded-xl h-11 xl:px-3.5 text-[15px] font-bold transition",
                  isActive(href) ? "bg-white/10 text-white" : "text-silver hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon size={20} className={isActive(href) ? "text-ice" : ""} />
                <span className="hidden xl:inline">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="px-2.5 xl:px-4 pb-5">
            <div className="rounded-2xl xl:bg-white/5 xl:p-3 flex flex-col xl:flex-row items-center gap-2 xl:gap-3">
              <div title={profile.full_name} className="h-10 w-10 xl:h-9 xl:w-9 shrink-0 rounded-full bg-ice text-navy-900 grid place-items-center font-extrabold">
                {initials}
              </div>
              <div className="min-w-0 flex-1 leading-tight hidden xl:block">
                <div className="font-bold truncate">{profile.full_name}</div>
                <div className="en text-silver text-xs truncate" dir="ltr">
                  @{profile.username}
                </div>
              </div>
              <button onClick={signOut} title="تسجيل الخروج" className="text-silver hover:text-white h-10 w-10 xl:h-auto xl:w-auto grid place-items-center xl:p-1.5 rounded-lg hover:bg-white/10">
                <LogOut size={18} />
              </button>
            </div>
            <p className="philosophy mt-4 text-center text-[10.5px] text-silver/60 hidden xl:block">لا طوابير · لا لفات · لا محاضرات</p>
          </div>
        </aside>

        {/* main */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* phone top bar */}
          <header className="md:hidden sticky top-0 z-30 bg-navy text-white px-4 h-14 flex items-center justify-between pt-[env(safe-area-inset-top)] box-content">
            <Link href="/" className="flex items-center gap-2.5" aria-label="الرئيسية">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/strike-logo-light.svg" alt="STRIKE" className="h-8 w-auto" />
              <span className="en font-bold tracking-[0.12em]">STRIKE</span>
            </Link>
            <div className="flex items-center -me-3">
              <Link href="/settings" className={clsx("h-11 w-11 grid place-items-center", isActive("/settings") ? "text-ice" : "text-silver")} aria-label="الإعدادات">
                <Settings size={20} />
              </Link>
              <button onClick={signOut} className="text-silver h-11 w-11 grid place-items-center" aria-label="تسجيل الخروج">
                <LogOut size={20} />
              </button>
            </div>
          </header>

          <main className="flex-1 pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-8">{children}</main>

          {/* phone bottom nav */}
          <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-silver-200 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 flex">
            {phoneMain.map(({ href, label, short, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMore(false)}
                className={clsx("flex-1 min-w-0 flex flex-col items-center gap-0.5 rounded-xl py-1.5 min-h-[52px] justify-center text-[11px] font-bold", isActive(href) ? "text-navy" : "text-ink-2")}
              >
                <Icon size={22} className={isActive(href) ? "text-ice" : ""} />
                <span className="truncate max-w-full">{short ?? label}</span>
              </Link>
            ))}
            {phoneMore.length > 0 && (
              <button
                type="button"
                onClick={() => setMore((v) => !v)}
                aria-expanded={more}
                className={clsx("flex-1 min-w-0 flex flex-col items-center gap-0.5 rounded-xl py-1.5 min-h-[52px] justify-center text-[11px] font-bold", more || moreActive ? "text-navy" : "text-ink-2")}
              >
                <Ellipsis size={22} className={more || moreActive ? "text-ice" : ""} />
                المزيد
              </button>
            )}
          </nav>

          {more && (
            <div className="md:hidden fixed inset-0 z-[29]" onClick={() => setMore(false)}>
              <div className="absolute inset-0 bg-navy-900/40 backdrop-blur-[1px]" />
              <div
                className="absolute inset-x-2 bottom-[calc(72px+env(safe-area-inset-bottom))] rounded-2xl bg-white shadow-[var(--shadow-pop)] border border-silver-200 p-2 fade-up"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-2 pt-1 pb-2">
                  <span className="font-extrabold text-navy">المزيد</span>
                  <button type="button" onClick={() => setMore(false)} className="h-9 w-9 grid place-items-center rounded-lg text-ink-2" aria-label="إغلاق">
                    <X size={18} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[...phoneMore, { href: "/settings", label: "الإعدادات", icon: Settings, phoneRank: 99 }].map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMore(false)}
                      className={clsx("rounded-xl py-3 flex flex-col items-center gap-1.5 text-[12.5px] font-bold border", isActive(href) ? "bg-ice-50 border-ice text-navy" : "bg-silver-100/60 border-transparent text-navy")}
                    >
                      <Icon size={22} className={isActive(href) ? "text-ice" : "text-navy"} />
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ConfirmProvider>
  );
}
