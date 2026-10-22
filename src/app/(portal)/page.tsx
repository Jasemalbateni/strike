import Link from "next/link";
import { Bell, UserCheck, Megaphone, Users, Settings, ArrowLeft, Wallet, ClipboardCheck, IdCard, AlertTriangle, PenTool, CalendarDays, Hourglass, Undo2 } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import { getProfile, canAccessMarketing, canApproveDrills, hasAccess, todayKW } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { kindOf, type Notification } from "@/lib/notifications";
import { DAY_SHORT, isTrainingDay, subState, trialVisibleOn, type Branch, type Player, type Subscription } from "@/lib/players";

const KW = "Asia/Kuwait";
function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: KW }));
  return h < 12 ? "صباح الخير" : "مساء الخير";
}

function nextTraining(from: string, branches: Branch[]) {
  let d = parseISO(from);
  for (let i = 0; i < 14; i++) {
    const iso = format(d, "yyyy-MM-dd");
    if (branches.some((b) => isTrainingDay(iso, b.training_days))) return iso;
    d = addDays(d, 1);
  }
  return null;
}

export default async function HomePage() {
  const profile = await getProfile();
  const marketing = canAccessMarketing(profile);
  const can = {
    attendance: hasAccess(profile, "attendance"),
    players: hasAccess(profile, "players"),
    drills: hasAccess(profile, "drills"),
    calendar: hasAccess(profile, "calendar"),
    approve: canApproveDrills(profile),
  };
  const supabase = await createClient();
  const today = todayKW();

  const [branchesRes, playersRes, sessionRes] = await Promise.all([
    supabase.from("branches").select("*").eq("is_active", true).order("created_at"),
    can.attendance || can.players ? supabase.from("players").select("id, kind, trial_date, branch_id, trial_outcome").eq("archived", false) : Promise.resolve({ data: [] }),
    can.attendance ? supabase.from("sessions").select("id, branch_id, cancelled").eq("session_date", today) : Promise.resolve({ data: [] }),
  ]);
  const branches = (branchesRes.data ?? []) as Branch[];
  const players = (playersRes.data ?? []) as Pick<Player, "id" | "kind" | "trial_date" | "branch_id" | "trial_outcome">[];
  const awaitingSub = players.filter((p) => p.kind === "trial" && p.trial_outcome === "registered").length;
  const todaySessions = (sessionRes.data ?? []) as { id: string; branch_id: string; cancelled: boolean }[];
  const trainingToday = branches.some((b) => isTrainingDay(today, b.training_days));
  const rosterToday = players.filter((p) => trialVisibleOn(p, today)).length;

  // counts that depend on access
  const [presentRes, mkUpcoming, mkReview, subsRes, pendingRes, returnedRes, libraryRes] = await Promise.all([
    todaySessions.length
      ? supabase.from("attendance").select("id", { count: "exact", head: true }).in("session_id", todaySessions.map((s) => s.id)).in("status", ["present", "late"])
      : Promise.resolve({ count: 0 }),
    marketing ? supabase.from("mk_posts").select("id", { count: "exact", head: true }).gte("scheduled_date", today).neq("status", "published") : Promise.resolve({ count: 0 }),
    marketing ? supabase.from("mk_posts").select("id", { count: "exact", head: true }).eq("status", "review") : Promise.resolve({ count: 0 }),
    can.players ? supabase.from("subscriptions").select("player_id, end_date").order("end_date", { ascending: false }) : Promise.resolve({ data: [] }),
    can.drills ? supabase.from("drill_sheets").select("id", { count: "exact", head: true }).eq("status", "pending") : Promise.resolve({ count: 0 }),
    can.drills ? supabase.from("drill_sheets").select("id", { count: "exact", head: true }).eq("status", "returned").eq("author_id", profile.id) : Promise.resolve({ count: 0 }),
    can.drills ? supabase.from("drill_sheets").select("id", { count: "exact", head: true }).eq("status", "approved") : Promise.resolve({ count: 0 }),
  ]);
  const presentToday = presentRes.count ?? 0;

  let expired = 0, expiring = 0, trials = 0;
  if (can.players) {
    const latest = new Map<string, Subscription>();
    for (const s of (subsRes.data ?? []) as Subscription[]) if (!latest.has(s.player_id)) latest.set(s.player_id, s);
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

  // next training day + its plan
  const nextDay = can.calendar ? nextTraining(today, branches) : null;
  let planCount = 0, planMinutes = 0;
  if (nextDay) {
    const { data } = await supabase.from("plan_items").select("kind, duration_min").eq("item_date", nextDay);
    for (const it of (data ?? []) as { kind: string; duration_min: number | null }[]) {
      if (it.kind === "drill") {
        planCount++;
        planMinutes += it.duration_min ?? 0;
      }
    }
  }

  const { data: unreadData } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", profile.id)
    .is("read_at", null)
    .neq("channel", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(5);
  const unread = (unreadData ?? []) as Notification[];

  const pending = pendingRes.count ?? 0;
  const returned = returnedRes.count ?? 0;
  const firstName = profile.full_name.trim().split(/\s+/)[0];
  const dayName = DAY_SHORT[parseISO(today).getDay()];

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl">
      <p className="text-ink-2 text-[15px]">{greeting()}،</p>
      <h1 className="display text-navy text-[36px] sm:text-[44px] leading-none mt-1">{firstName}</h1>

      {unread.length > 0 && (
        <Link href="/notifications" className="mt-6 block rounded-2xl bg-navy text-white p-4 sm:p-5 shadow-[var(--shadow-pop)] hover:bg-navy-900 transition">
          <div className="flex items-center gap-2.5 mb-2.5">
            <span className="h-9 w-9 rounded-xl bg-gold text-navy-900 grid place-items-center">
              <Bell size={18} />
            </span>
            <span className="font-extrabold text-[16px]">
              {unread.length === 1 ? "عندك تنبيه جديد" : <><span className="num">{unread.length}</span> تنبيهات جديدة</>}
            </span>
            <span className="ms-auto text-silver text-[13px] font-bold flex items-center gap-1">
              عرض <ArrowLeft size={15} />
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {unread.slice(0, 3).map((n) => (
              <li key={n.id} className="flex items-start gap-2 text-[14px]">
                <span className="chip bg-white/10 text-silver text-[11px] px-2 py-0.5 shrink-0 mt-0.5">{kindOf(n.kind).label}</span>
                <span className="font-bold leading-snug">{n.title}</span>
              </li>
            ))}
          </ul>
        </Link>
      )}

      <div className="mt-6 grid gap-2">
        {can.players && expired + expiring > 0 && (
          <Alert href="/players" tone={expired ? "error" : "gold"} icon={<AlertTriangle size={18} className="shrink-0" />}>
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
          </Alert>
        )}
        {can.players && awaitingSub > 0 && (
          <Alert href="/players" tone="gold" icon={<UserCheck size={18} className="shrink-0" />}>
            <span className="num">{awaitingSub}</span> {awaitingSub === 1 ? "لاعب تجربة سجّل — بانتظار إضافة اشتراكه" : "لاعبين تجربة سجّلوا — بانتظار إضافة اشتراكاتهم"}
          </Alert>
        )}
        {can.approve && pending > 0 && (
          <Alert href="/drills?tab=pending" tone="gold" icon={<Hourglass size={18} className="shrink-0" />}>
            <span className="num">{pending}</span> {pending === 1 ? "ورقة تمرين بانتظار اعتمادك" : "أوراق تمارين بانتظار اعتمادك"}
          </Alert>
        )}
        {can.drills && returned > 0 && (
          <Alert href="/drills?tab=mine" tone="error" icon={<Undo2 size={18} className="shrink-0" />}>
            <span className="num">{returned}</span> {returned === 1 ? "ورقة أُرجعت لك للتعديل" : "أوراق أُرجعت لك للتعديل"}
          </Alert>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mt-4">
        {can.attendance && (
          <Card href="/attendance" icon={<ClipboardCheck size={22} />} iconCls="bg-ice text-navy-900" title="الحضور" sub={trainingToday ? `اليوم ${dayName} — يوم تدريب` : `اليوم ${dayName} — ما فيه تدريب`}>
            <Stat n={presentToday} of={rosterToday} label="حاضر اليوم" />
            {todaySessions.some((s) => s.cancelled) && <div className="chip bg-error-100 text-error self-center">حصة ملغاة</div>}
          </Card>
        )}

        {can.drills && (
          <Card href="/drills" icon={<PenTool size={21} />} iconCls="bg-navy text-white" title="مكتبة التمارين" sub="أوراق التمارين المعتمدة ولوحة الرسم">
            <Stat n={libraryRes.count ?? 0} label="في المكتبة" />
            {can.approve ? <Stat n={pending} label="بانتظار الاعتماد" gold={pending > 0} /> : <Stat n={returned} label="مُرجع للتعديل" red={returned > 0} />}
          </Card>
        )}

        {can.calendar && (
          <Card href="/calendar" icon={<CalendarDays size={22} />} iconCls="bg-ice-100 text-navy" title="التقويم" sub={nextDay ? `التدريب القادم: ${nextDay === today ? "اليوم" : format(parseISO(nextDay), "EEEE d MMMM", { locale: ar })}` : "أيام التدريب والأحداث"}>
            <Stat n={planCount} label="تمارين مخططة" />
            <Stat n={planMinutes} label="دقيقة" />
          </Card>
        )}

        {can.players && (
          <Card href="/players" icon={<IdCard size={22} />} iconCls="bg-gold-100 text-navy" title="اللاعبين" sub="السجل، الاشتراكات، التجارب والتكلفة">
            <Stat n={players.filter((p) => p.kind === "subscriber").length} label="مشترك" />
            <Stat n={expired} label="منتهي" red={expired > 0} />
            <Stat n={expiring} label="ينتهي قريباً" gold={expiring > 0} />
            <Stat n={trials} label="تجربة" gold={trials > 0} />
          </Card>
        )}

        {marketing && (
          <Card href="/marketing" icon={<Megaphone size={22} />} iconCls="bg-ice-100 text-navy" title="مركز التسويق" sub="الأهداف، الخطة، الأفكار، التقويم، المتابعة">
            <Stat n={mkUpcoming.count ?? 0} label="منشور قادم" />
            <Stat n={mkReview.count ?? 0} label="بانتظار الاعتماد" gold={(mkReview.count ?? 0) > 0} />
          </Card>
        )}

        {profile.role === "owner" && <Card href="/team" icon={<Users size={22} />} iconCls="bg-navy-50 text-navy" title="الفريق" sub="الحسابات، الأدوار، والصفحات لكل موظف" />}

        <Card href="/settings" icon={<Settings size={22} />} iconCls="bg-silver-100 text-navy" title="الإعدادات" sub="حسابك وكلمة المرور" />
      </div>

      <div className="mt-10">
        <div className="text-ink-2 text-xs font-bold tracking-wide mb-3">قادم في البوابة</div>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[14px] border border-dashed border-silver bg-white/50 p-4 flex items-center gap-3 text-ink-2">
            <Wallet size={18} />
            <span className="font-bold text-sm">المالية</span>
            <span className="chip bg-silver-100 text-ink-2 ms-auto">قريباً</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Alert({ href, tone, icon, children }: { href: string; tone: "error" | "gold"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${tone === "error" ? "border-error/40 bg-error-100/50 text-error" : "border-gold/60 bg-gold-100/60 text-navy-900"}`}>
      {icon}
      <span className="font-bold text-sm flex-1">{children}</span>
      <ArrowLeft size={16} />
    </Link>
  );
}

function Card({ href, icon, iconCls, title, sub, children }: { href: string; icon: React.ReactNode; iconCls: string; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="card group p-5 flex flex-col gap-4 hover:border-ice transition">
      <div className="flex items-start justify-between">
        <div className={`h-11 w-11 rounded-2xl grid place-items-center ${iconCls}`}>{icon}</div>
        <ArrowLeft size={18} className="text-silver group-hover:text-ice transition" />
      </div>
      <div>
        <div className="font-extrabold text-navy text-[18px]">{title}</div>
        <div className="text-ink-2 text-sm mt-0.5">{sub}</div>
      </div>
      {children && <div className="flex gap-4 pt-1 border-t border-silver-200 flex-wrap">{children}</div>}
    </Link>
  );
}

function Stat({ n, of, label, gold, red }: { n: number; of?: number; label: string; gold?: boolean; red?: boolean }) {
  return (
    <div>
      <div className={`num text-[26px] font-bold leading-none ${red ? "text-error" : gold ? "text-gold" : "text-navy"}`}>
        {n}
        {of !== undefined && <span className="text-ink-2 text-[15px]">/{of}</span>}
      </div>
      <div className="text-ink-2 text-xs mt-1">{label}</div>
    </div>
  );
}
