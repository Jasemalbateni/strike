import Link from "next/link";
import { Megaphone, Users, Settings, ArrowLeft, Dumbbell, Wallet, ClipboardCheck, IdCard, AlertTriangle } from "lucide-react";
import { getProfile, canAccessMarketing, canManagePlayers, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DAY_SHORT, isTrainingDay, subState, trialVisibleOn, type Branch, type Player, type Subscription } from "@/lib/players";
import { parseISO } from "date-fns";

const KW = "Asia/Kuwait";
function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: KW }));
  return h < 12 ? "صباح الخير" : "مساء الخير";
}

export default async function HomePage() {
  const profile = await getProfile();
  const marketing = canAccessMarketing(profile);
  const managePlayers = canManagePlayers(profile);
  const supabase = await createClient();
  const today = todayKW();

  let upcoming = 0;
  let review = 0;
  if (marketing) {
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      supabase.from("mk_posts").select("id", { count: "exact", head: true }).gte("scheduled_date", today).neq("status", "published"),
      supabase.from("mk_posts").select("id", { count: "exact", head: true }).eq("status", "review"),
    ]);
    upcoming = c1 ?? 0;
    review = c2 ?? 0;
  }

  // today's training + attendance so far
  const [branchesRes, playersRes, sessionRes] = await Promise.all([
    supabase.from("branches").select("*").eq("is_active", true).order("created_at"),
    supabase.from("players").select("id, kind, trial_date, branch_id").eq("archived", false),
    supabase.from("sessions").select("id, branch_id, cancelled").eq("session_date", today),
  ]);
  const branches = (branchesRes.data ?? []) as Branch[];
  const players = (playersRes.data ?? []) as Pick<Player, "id" | "kind" | "trial_date" | "branch_id">[];
  const todaySessions = sessionRes.data ?? [];
  const trainingToday = branches.some((b) => isTrainingDay(today, b.training_days));
  const rosterToday = players.filter((p) => trialVisibleOn(p, today)).length;
  let presentToday = 0;
  if (todaySessions.length) {
    const { count } = await supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .in("session_id", todaySessions.map((s) => s.id))
      .in("status", ["present", "late"]);
    presentToday = count ?? 0;
  }

  // subscription alerts (managers only — coaches can't read subscriptions)
  let expired = 0;
  let expiring = 0;
  let trials = 0;
  if (managePlayers) {
    const { data: subs } = await supabase.from("subscriptions").select("player_id, end_date").order("end_date", { ascending: false });
    const latest = new Map<string, Subscription>();
    for (const s of (subs ?? []) as Subscription[]) if (!latest.has(s.player_id)) latest.set(s.player_id, s);
    for (const p of players) {
      if (p.kind === "trial") {
        trials++;
        continue;
      }
      const st = subState(latest.get(p.id), today).state;
      if (st === "expired") expired++;
      else if (st === "expiring") expiring++;
    }
  }

  const firstName = profile.full_name.trim().split(/\s+/)[0];
  const dayName = DAY_SHORT[parseISO(today).getDay()];

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl">
      <p className="text-ink-2 text-[15px]">{greeting()}،</p>
      <h1 className="display text-navy text-[36px] sm:text-[44px] leading-none mt-1">{firstName}</h1>

      {managePlayers && expired + expiring > 0 && (
        <Link href="/players" className={`mt-6 flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${expired ? "border-error/40 bg-error-100/50 text-error" : "border-gold/60 bg-gold-100/60 text-navy-900"}`}>
          <AlertTriangle size={18} className="shrink-0" />
          <span className="font-bold text-sm flex-1">
            {expired > 0 && (
              <>
                <span className="num">{expired}</span> انتهى اشتراكهم
              </>
            )}
            {expired > 0 && expiring > 0 && " · "}
            {expiring > 0 && (
              <>
                <span className="num">{expiring}</span> ينتهي خلال ٧ أيام
              </>
            )}
          </span>
          <ArrowLeft size={16} />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mt-6">
        <Link href="/attendance" className="card group p-5 flex flex-col gap-4 hover:border-ice transition">
          <div className="flex items-start justify-between">
            <div className="h-11 w-11 rounded-2xl bg-ice text-navy-900 grid place-items-center">
              <ClipboardCheck size={22} />
            </div>
            <ArrowLeft size={18} className="text-silver group-hover:text-ice transition" />
          </div>
          <div>
            <div className="font-extrabold text-navy text-[18px]">الحضور</div>
            <div className="text-ink-2 text-sm mt-0.5">{trainingToday ? `اليوم ${dayName} — يوم تدريب` : `اليوم ${dayName} — ما فيه تدريب`}</div>
          </div>
          <div className="flex gap-4 pt-1 border-t border-silver-200">
            <div>
              <div className="num text-navy text-[26px] font-bold leading-none">
                {presentToday}
                <span className="text-ink-2 text-[15px]">/{rosterToday}</span>
              </div>
              <div className="text-ink-2 text-xs mt-1">حاضر اليوم</div>
            </div>
            {todaySessions.some((s) => s.cancelled) && <div className="chip bg-error-100 text-error self-center">حصة ملغاة</div>}
          </div>
        </Link>

        {managePlayers && (
          <Link href="/players" className="card group p-5 flex flex-col gap-4 hover:border-ice transition">
            <div className="flex items-start justify-between">
              <div className="h-11 w-11 rounded-2xl bg-gold-100 text-navy grid place-items-center">
                <IdCard size={22} />
              </div>
              <ArrowLeft size={18} className="text-silver group-hover:text-ice transition" />
            </div>
            <div>
              <div className="font-extrabold text-navy text-[18px]">اللاعبين</div>
              <div className="text-ink-2 text-sm mt-0.5">السجل، الاشتراكات، التجارب والتكلفة</div>
            </div>
            <div className="flex gap-4 pt-1 border-t border-silver-200">
              <div>
                <div className="num text-navy text-[26px] font-bold leading-none">{players.filter((p) => p.kind === "subscriber").length}</div>
                <div className="text-ink-2 text-xs mt-1">مشترك</div>
              </div>
              <div>
                <div className={`num text-[26px] font-bold leading-none ${expired ? "text-error" : "text-navy"}`}>{expired}</div>
                <div className="text-ink-2 text-xs mt-1">منتهي</div>
              </div>
              <div>
                <div className={`num text-[26px] font-bold leading-none ${expiring ? "text-gold" : "text-navy"}`}>{expiring}</div>
                <div className="text-ink-2 text-xs mt-1">ينتهي قريباً</div>
              </div>
              <div>
                <div className={`num text-[26px] font-bold leading-none ${trials ? "text-gold" : "text-navy"}`}>{trials}</div>
                <div className="text-ink-2 text-xs mt-1">تجربة</div>
              </div>
            </div>
          </Link>
        )}

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
