import Link from "next/link";
import { Megaphone, Users, Settings, ArrowLeft, Dumbbell, CalendarCheck, ClipboardList, Wallet } from "lucide-react";
import { getProfile, canAccessMarketing } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kuwait" }));
  if (h < 12) return "صباح الخير";
  if (h < 17) return "مساء الخير";
  return "مساء الخير";
}

export default async function HomePage() {
  const profile = await getProfile();
  const marketing = canAccessMarketing(profile);
  const supabase = await createClient();

  let upcoming = 0;
  let review = 0;
  if (marketing) {
    const today = format(new Date(), "yyyy-MM-dd");
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      supabase.from("mk_posts").select("id", { count: "exact", head: true }).gte("scheduled_date", today).neq("status", "published"),
      supabase.from("mk_posts").select("id", { count: "exact", head: true }).eq("status", "review"),
    ]);
    upcoming = c1 ?? 0;
    review = c2 ?? 0;
  }

  const firstName = profile.full_name.trim().split(/\s+/)[0];

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl">
      <p className="text-ink-2 text-[15px]">{greeting()}،</p>
      <h1 className="display text-navy text-[36px] sm:text-[44px] leading-none mt-1">{firstName}</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mt-8">
        {marketing && (
          <Link href="/marketing" className="card group p-5 flex flex-col gap-4 hover:border-ice transition">
            <div className="flex items-start justify-between">
              <div className="h-11 w-11 rounded-2xl bg-ice-100 text-navy grid place-items-center">
                <Megaphone size={22} />
              </div>
              <ArrowLeft size={18} className="text-silver group-hover:text-ice transition" />
            </div>
            <div>
              <div className="font-extrabold text-navy text-[18px]">مركز التسويق</div>
              <div className="text-ink-2 text-sm mt-0.5">الأهداف، الخطة، الأفكار، التقويم، المتابعة</div>
            </div>
            <div className="flex gap-4 pt-1 border-t border-silver-200">
              <div>
                <div className="num text-navy text-[26px] font-bold leading-none">{upcoming}</div>
                <div className="text-ink-2 text-xs mt-1">منشور قادم</div>
              </div>
              <div>
                <div className={`num text-[26px] font-bold leading-none ${review ? "text-gold" : "text-navy"}`}>{review}</div>
                <div className="text-ink-2 text-xs mt-1">بانتظار الاعتماد</div>
              </div>
            </div>
          </Link>
        )}

        {profile.role === "owner" && (
          <Link href="/team" className="card group p-5 flex flex-col gap-4 hover:border-ice transition">
            <div className="flex items-start justify-between">
              <div className="h-11 w-11 rounded-2xl bg-navy-50 text-navy grid place-items-center">
                <Users size={22} />
              </div>
              <ArrowLeft size={18} className="text-silver group-hover:text-ice transition" />
            </div>
            <div>
              <div className="font-extrabold text-navy text-[18px]">الفريق</div>
              <div className="text-ink-2 text-sm mt-0.5">إنشاء الحسابات وتحديد الصلاحيات</div>
            </div>
          </Link>
        )}

        <Link href="/settings" className="card group p-5 flex flex-col gap-4 hover:border-ice transition">
          <div className="flex items-start justify-between">
            <div className="h-11 w-11 rounded-2xl bg-silver-100 text-navy grid place-items-center">
              <Settings size={22} />
            </div>
            <ArrowLeft size={18} className="text-silver group-hover:text-ice transition" />
          </div>
          <div>
            <div className="font-extrabold text-navy text-[18px]">الإعدادات</div>
            <div className="text-ink-2 text-sm mt-0.5">حسابك وكلمة المرور</div>
          </div>
        </Link>
      </div>

      <div className="mt-10">
        <div className="text-ink-2 text-xs font-bold tracking-wide mb-3">قادم في البوابة</div>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Dumbbell, label: "بنك التمارين" },
            { icon: CalendarCheck, label: "الحصص" },
            { icon: ClipboardList, label: "اللاعبين والحضور" },
            { icon: Wallet, label: "المالية" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="rounded-[14px] border border-dashed border-silver bg-white/50 p-4 flex items-center gap-3 text-ink-2">
              <Icon size={18} />
              <span className="font-bold text-sm">{label}</span>
              <span className="chip bg-silver-100 text-ink-2 ms-auto">قريباً</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
