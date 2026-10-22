"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Users, Wallet, UserPlus, Percent, ClipboardCheck, RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth, startOfWeek, subDays } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { BarChart, TrendChart } from "@/components/development/charts";
import { computeRenewals } from "@/components/players/renewals";
import { PILLARS, fmt1, overall, pillarAvg, type Scores } from "@/lib/development";
import type { Player, Subscription } from "@/lib/players";

export type Data = {
  players: { id: string; full_name: string; group_id: string | null; branch_id: string | null; kind: "subscriber" | "trial"; source: string; trial_date: string | null; converted_at: string | null; archived: boolean; created_at: string }[];
  subs: { id: string; player_id: string; start_date: string; end_date: string; amount: number; paid: boolean; paid_at: string | null }[];
  sessions: { id: string; branch_id: string; session_date: string; cancelled: boolean }[];
  attendance: { session_id: string; player_id: string; status: "present" | "absent" | "late" | "excused" }[];
  groups: { id: string; name: string; branch_id: string; position: number }[];
  sheets: { author_id: string | null; status: string; submitted_at: string | null; created_at: string }[];
  evals: { player_id: string; eval_date: string; scores: Scores; created_by: string | null }[];
  notes: { created_by: string | null; created_at: string }[];
  notifs: { recipient_id: string; kind: string; created_at: string }[];
  staff: { id: string; full_name: string; role: string; is_active: boolean }[];
  metrics: { week_start: string; trials: number; registrations: number; views: number; platform: string }[];
};

const PERIODS = [
  { days: 30, label: "آخر ٣٠ يوم" },
  { days: 90, label: "آخر ٣ شهور" },
  { days: 180, label: "آخر ٦ شهور" },
  { days: 365, label: "آخر سنة" },
  { days: 0, label: "من البداية" },
];

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
const kd = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

export default function AnalyticsBoard({ today, data }: { today: string; data: Data }) {
  const [days, setDays] = useState(90);
  const from = days ? iso(subDays(parseISO(today), days - 1)) : "0000-01-01";
  const prevFrom = days ? iso(subDays(parseISO(from), days)) : null;
  const prevTo = days ? iso(subDays(parseISO(from), 1)) : null;
  const inP = (d: string | null | undefined) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= today;
  const inPrev = (d: string | null | undefined) => !!d && !!prevFrom && d.slice(0, 10) >= prevFrom && d.slice(0, 10) <= prevTo!;

  const m = useMemo(() => {
    const { players, subs, sessions, attendance, groups, evals } = data;
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const playerById = new Map(players.map((p) => [p.id, p]));

    const activeOn = (d: string) => new Set(subs.filter((s) => s.start_date <= d && s.end_date >= d).map((s) => s.player_id)).size;
    const revenueIn = (test: (d: string) => boolean) => subs.filter((s) => s.paid && test(s.paid_at ?? s.start_date)).reduce((t, s) => t + (Number(s.amount) || 0), 0);

    // trials & conversion
    const trials = players.filter((p) => p.trial_date && inP(p.trial_date));
    const converted = trials.filter((p) => p.converted_at);
    const trialsPrev = players.filter((p) => inPrev(p.trial_date));
    const convertedPrev = trialsPrev.filter((p) => p.converted_at);

    // attendance
    const marks = (test: (d: string) => boolean) => attendance.filter((a) => {
      const s = sessionById.get(a.session_id);
      return s && !s.cancelled && test(s.session_date) && a.status !== "excused";
    });
    const rate = (list: Data["attendance"]) => pct(list.filter((a) => a.status === "present" || a.status === "late").length, list.length);
    const att = marks(inP);
    const attPrev = marks(inPrev);

    // renewals within the period (bucketed by end date month)
    const buckets = computeRenewals(players as unknown as Player[], subs as unknown as Subscription[], today, "month");
    const ended = subs.filter((s) => inP(s.end_date) && s.end_date <= today).length;
    const inBuckets = buckets.filter((b) => b.key >= from.slice(0, 7));
    const renewed = inBuckets.reduce((t, b) => t + b.renewed, 0);
    const lost = inBuckets.reduce((t, b) => t + b.lost, 0);

    // monthly series — last 12 months
    const months = Array.from({ length: 12 }, (_, i) => startOfMonth(addMonths(parseISO(today), i - 11)));
    const monthly = months.map((ms) => {
      const end = endOfMonth(ms);
      const at = iso(end) > today ? today : iso(end);
      const a = iso(ms), b = iso(end);
      return {
        label: format(ms, "MMM", { locale: ar }),
        hint: format(ms, "MMMM yyyy", { locale: ar }),
        date: at,
        active: activeOn(at),
        revenue: revenueIn((d) => d >= a && d <= b),
        trials: players.filter((p) => p.trial_date && p.trial_date >= a && p.trial_date <= b).length,
      };
    });

    // weekly attendance — last 12 weeks
    const weeks = Array.from({ length: 12 }, (_, i) => startOfWeek(subDays(parseISO(today), (11 - i) * 7), { weekStartsOn: 1 }));
    const weekly = weeks
      .map((ws) => {
        const a = iso(ws), b = iso(addDays(ws, 6));
        const r = rate(marks((d) => d >= a && d <= b));
        return r === null ? null : { date: a, value: r };
      })
      .filter((x): x is { date: string; value: number } => x !== null);

    // sources (players that joined in the period)
    const joined = players.filter((p) => inP(p.trial_date ?? p.created_at));
    const srcMap = new Map<string, { n: number; conv: number }>();
    for (const p of joined) {
      const k = p.source || "غير محدد";
      const v = srcMap.get(k) ?? { n: 0, conv: 0 };
      v.n++;
      if (p.kind === "subscriber" || p.converted_at) v.conv++;
      srcMap.set(k, v);
    }
    const sources = [...srcMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.n - a.n);

    // latest evaluation per player
    const latestEval = new Map<string, Data["evals"][number]>();
    for (const e of [...evals].sort((a, b) => a.eval_date.localeCompare(b.eval_date))) latestEval.set(e.player_id, e);
    const stale = players.filter((p) => !p.archived).filter((p) => {
      const e = latestEval.get(p.id);
      return !e || e.eval_date < iso(subDays(parseISO(today), 30));
    });

    // per group
    const byGroup = groups.map((g) => {
      const ps = players.filter((p) => !p.archived && p.group_id === g.id);
      const ids = new Set(ps.map((p) => p.id));
      const gm = att.filter((a) => ids.has(a.player_id));
      const evs = ps.map((p) => latestEval.get(p.id)).filter(Boolean) as Data["evals"];
      const pillar = PILLARS.map((pl) => {
        const vals = evs.map((e) => pillarAvg(e.scores, pl.key)).filter((v): v is number => v !== null);
        return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
      });
      const ovs = evs.map((e) => overall(e.scores)).filter((v): v is number => v !== null);
      return {
        g,
        players: ps.length,
        active: ps.filter((p) => subs.some((s) => s.player_id === p.id && s.start_date <= today && s.end_date >= today)).length,
        rate: rate(gm),
        overall: ovs.length ? ovs.reduce((x, y) => x + y, 0) / ovs.length : null,
        pillar,
        evaluated: evs.length,
      };
    });

    return {
      activeNow: activeOn(today),
      activePrev: prevTo ? activeOn(prevTo) : null,
      revenue: revenueIn(inP),
      revenuePrev: prevFrom ? revenueIn(inPrev) : null,
      trials: trials.length,
      trialsPrev: prevFrom ? trialsPrev.length : null,
      conv: pct(converted.length, trials.length),
      convPrev: prevFrom ? pct(convertedPrev.length, trialsPrev.length) : null,
      converted: converted.length,
      attRate: rate(att),
      attRatePrev: prevFrom ? rate(attPrev) : null,
      attCount: att.length,
      renewRate: pct(renewed, renewed + lost),
      renewed,
      lost,
      ended,
      monthly,
      weekly,
      sources,
      stale,
      byGroup,
      playerById,
      avgOverall: (() => {
        const v = [...latestEval.values()].filter((e) => playerById.get(e.player_id) && !playerById.get(e.player_id)!.archived).map((e) => overall(e.scores)).filter((x): x is number => x !== null);
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
      })(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, from, prevFrom, prevTo, today]);

  // coaches activity
  const coaches = useMemo(
    () =>
      data.staff
        .filter((s) => s.is_active)
        .map((s) => ({
          s,
          sheets: data.sheets.filter((x) => x.author_id === s.id && inP(x.submitted_at ?? x.created_at)).length,
          approved: data.sheets.filter((x) => x.author_id === s.id && x.status === "approved" && inP(x.submitted_at ?? x.created_at)).length,
          evals: data.evals.filter((x) => x.created_by === s.id && inP(x.eval_date)).length,
          notes: data.notes.filter((x) => x.created_by === s.id && inP(x.created_at)).length,
          late: data.notifs.filter((x) => x.recipient_id === s.id && x.kind === "late" && inP(x.created_at)).length,
          absent: data.notifs.filter((x) => x.recipient_id === s.id && x.kind === "absence" && inP(x.created_at)).length,
        }))
        .filter((c) => c.s.role !== "owner" || c.sheets + c.evals + c.notes > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, from, today],
  );

  // marketing: site-entered weekly numbers in the period
  const mk = useMemo(() => {
    const rows = data.metrics.filter((r) => inP(r.week_start));
    return { trials: rows.reduce((t, r) => t + (r.trials ?? 0), 0), regs: rows.reduce((t, r) => t + (r.registrations ?? 0), 0), views: rows.reduce((t, r) => t + (r.views ?? 0), 0), weeks: new Set(rows.map((r) => r.week_start)).size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.metrics, from, today]);

  const periodLabel = PERIODS.find((p) => p.days === days)!.label;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <button key={p.days} onClick={() => setDays(p.days)} className={clsx("chip h-9 px-3.5 text-[13.5px]", days === p.days ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={<Users size={17} />} label="مشتركين نشطين الآن" value={String(m.activeNow)} cur={m.activeNow} prev={m.activePrev} />
        <Kpi icon={<Wallet size={17} />} label="الإيراد" value={kd(m.revenue)} unit="د.ك" cur={m.revenue} prev={m.revenuePrev} />
        <Kpi icon={<UserPlus size={17} />} label="لاعبي تجربة" value={String(m.trials)} cur={m.trials} prev={m.trialsPrev} />
        <Kpi icon={<Percent size={17} />} label="التحويل لمشترك" value={m.conv === null ? "—" : `${m.conv}%`} sub={m.trials ? `${m.converted} من ${m.trials}` : undefined} cur={m.conv} prev={m.convPrev} points />
        <Kpi icon={<ClipboardCheck size={17} />} label="نسبة الحضور" value={m.attRate === null ? "—" : `${m.attRate}%`} cur={m.attRate} prev={m.attRatePrev} points />
        <Kpi icon={<RefreshCw size={17} />} label="معدل التجديد" value={m.renewRate === null ? "—" : `${m.renewRate}%`} sub={m.renewed + m.lost ? `${m.renewed} جدد · ${m.lost} لم يجدد` : "ما انتهى اشتراك بالفترة"} />
      </div>
      {days > 0 && <p className="text-ink-2 text-[12px] -mt-2">الأسهم تقارن {periodLabel} بالفترة اللي قبلها بنفس الطول.</p>}

      {/* monthly charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="المشتركين النشطين" sub="آخر ١٢ شهر — في نهاية كل شهر">
          <TrendChart points={m.monthly.map((x) => ({ date: x.date, value: x.active }))} min={0} max={Math.max(5, ...m.monthly.map((x) => x.active))} unit="مشترك" label="المشتركين النشطين شهرياً" />
        </Panel>
        <Panel title="الإيراد الشهري" sub="آخر ١٢ شهر — الاشتراكات المدفوعة بتاريخ الدفع">
          <BarChart bars={m.monthly.map((x) => ({ label: x.label, hint: x.hint, value: x.revenue }))} unit="د.ك" format={kd} label="الإيراد الشهري" />
        </Panel>
        <Panel title="لاعبي التجربة شهرياً" sub="عدد اللي جربوا كل شهر">
          <BarChart bars={m.monthly.map((x) => ({ label: x.label, hint: x.hint, value: x.trials }))} color="#1baf7a" label="لاعبي التجربة شهرياً" />
        </Panel>
        <Panel title="نسبة الحضور الأسبوعية" sub="آخر ١٢ أسبوع (حاضر + متأخر)">
          {m.weekly.length > 1 ? <TrendChart points={m.weekly} min={0} max={100} unit="%" label="نسبة الحضور الأسبوعية" /> : <Empty>يظهر بعد تسجيل حضور أسبوعين</Empty>}
        </Panel>
      </div>

      {/* sources + marketing */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="من وين يجون اللاعبين؟" sub={`${periodLabel} — المصدر ونسبة اللي صاروا مشتركين`}>
          {m.sources.length ? (
            <div className="flex flex-col gap-2.5">
              {m.sources.map((s) => {
                const max = m.sources[0].n;
                return (
                  <div key={s.name} className="grid grid-cols-[110px_1fr_auto] items-center gap-2.5 text-[13px]" title={`${s.name}: ${s.n} لاعب، ${s.conv} صاروا مشتركين`}>
                    <span className="font-bold text-navy truncate">{s.name}</span>
                    <span className="h-2.5 rounded-full bg-silver-100 relative">
                      <span className="absolute inset-y-0 start-0 rounded-full bg-[#2a78d6]" style={{ width: `${(s.n / max) * 100}%` }} />
                    </span>
                    <span className="num text-navy font-bold w-[92px] text-end">
                      {s.n} <span className="text-ink-2 font-normal text-[12px]">· {pct(s.conv, s.n)}% اشترك</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty>ما فيه لاعبين جدد بالفترة</Empty>
          )}
        </Panel>
        <Panel title="التسويق مقابل الواقع" sub={`${periodLabel} — أرقام المتابعة في مركز التسويق مقابل المسجّل فعلياً`}>
          <div className="grid grid-cols-2 gap-3">
            <Mini label="تجارب (حسب التسويق)" value={mk.trials} />
            <Mini label="تجارب مسجلة فعلياً" value={m.trials} />
            <Mini label="مسجلين (حسب التسويق)" value={mk.regs} />
            <Mini label="تحوّلوا لمشتركين فعلياً" value={m.converted} />
          </div>
          <p className="text-ink-2 text-[12px] mt-3">
            {mk.weeks ? `من ${mk.weeks} أسبوع متابعة · ${kd(mk.views)} مشاهدة.` : "ما فيه أسابيع متابعة مسجّلة بالفترة."} لو الرقمين بعيدين عن بعض، معناه فيه تجارب ما تنسجل بالموقع أو العكس.
          </p>
        </Panel>
      </div>

      {/* groups */}
      <Panel title="مقارنة الفئات" sub={`${periodLabel} — الحضور ومستوى اللاعبين حسب آخر تقييم`}>
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-[13.5px] min-w-[640px]">
            <thead>
              <tr className="text-ink-2 text-[12px]">
                <th className="text-start font-bold py-2">الفئة</th>
                <th className="text-center font-bold">اللاعبين</th>
                <th className="text-center font-bold">نشطين</th>
                <th className="text-center font-bold">الحضور</th>
                <th className="text-center font-bold">التقييم العام</th>
                {PILLARS.map((p) => (
                  <th key={p.key} className="text-center font-bold">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      {p.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.byGroup.map((r) => (
                <tr key={r.g.id} className="border-t border-silver-200">
                  <td className="py-2.5 font-bold text-navy">{r.g.name}</td>
                  <td className="text-center num">{r.players}</td>
                  <td className="text-center num">{r.active}</td>
                  <td className={clsx("text-center num font-bold", r.rate !== null && r.rate < 70 ? "text-error" : "text-navy")}>{r.rate === null ? "—" : `${r.rate}%`}</td>
                  <td className="text-center num font-bold text-navy">
                    {fmt1(r.overall)}
                    {r.evaluated < r.players && <span className="block text-[10.5px] text-ink-2 font-normal">{r.evaluated} من {r.players} مقيّم</span>}
                  </td>
                  {r.pillar.map((v, i) => (
                    <td key={i} className="text-center num">
                      {fmt1(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-[13px]">
          <span className="text-ink-2">متوسط تقييم الأكاديمية:</span>
          <span className="num font-extrabold text-navy text-[18px]">{fmt1(m.avgOverall)}</span>
          <span className="text-ink-2">/ 5</span>
        </div>
      </Panel>

      {/* coaches */}
      <Panel title="نشاط المدربين" sub={`${periodLabel} — أوراق التمارين، التقييمات، الملاحظات وتنبيهات الانضباط`}>
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-[13.5px] min-w-[600px]">
            <thead>
              <tr className="text-ink-2 text-[12px]">
                <th className="text-start font-bold py-2">الاسم</th>
                <th className="text-center font-bold">أوراق تمارين</th>
                <th className="text-center font-bold">معتمدة</th>
                <th className="text-center font-bold">تقييمات لاعبين</th>
                <th className="text-center font-bold">ملاحظات</th>
                <th className="text-center font-bold">تأخير</th>
                <th className="text-center font-bold">غياب</th>
              </tr>
            </thead>
            <tbody>
              {coaches.map((c) => (
                <tr key={c.s.id} className="border-t border-silver-200">
                  <td className="py-2.5 font-bold text-navy">{c.s.full_name}</td>
                  <td className="text-center num">{c.sheets}</td>
                  <td className="text-center num">{c.approved}</td>
                  <td className="text-center num">{c.evals}</td>
                  <td className="text-center num">{c.notes}</td>
                  <td className={clsx("text-center num", c.late > 0 && "text-[#a06a00] font-bold")}>{c.late}</td>
                  <td className={clsx("text-center num", c.absent > 0 && "text-error font-bold")}>{c.absent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-ink-2 text-[12px] mt-2">التأخير والغياب محسوبين من التنبيهات اللي أرسلتها لكل مدرب.</p>
      </Panel>

      {/* needs attention */}
      {m.stale.length > 0 && (
        <Panel title="لاعبين يحتاجون تقييم" sub="ما تقيّموا أبداً أو آخر تقييم أقدم من ٣٠ يوم">
          <div className="flex items-start gap-2 text-[13px] mb-3 text-[#8a6a00] bg-gold/15 rounded-lg px-3 py-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              <span className="num font-bold">{m.stale.length}</span> لاعب — التقييم المنتظم هو اللي يبيّن التطوّر لأولياء الأمور.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {m.stale.slice(0, 40).map((p) => (
              <Link key={p.id} href={`/development/${p.id}`} className="chip h-8 px-3 bg-white border border-silver-200 text-navy hover:border-ice text-[13px]">
                {p.full_name}
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, unit, sub, cur, prev, points }: { icon: React.ReactNode; label: string; value: string; unit?: string; sub?: string; cur?: number | null; prev?: number | null; points?: boolean }) {
  const d = cur != null && prev != null ? cur - prev : null;
  const rel = d !== null && !points && prev ? Math.round((d / prev) * 100) : null;
  return (
    <div className="card p-3.5 flex flex-col gap-1.5">
      <span className="text-ink-2 text-[12px] font-bold flex items-center gap-1.5">
        <span className="text-ice-600">{icon}</span>
        {label}
      </span>
      <span className="flex items-end gap-1">
        <span className="num text-navy font-extrabold text-[26px] leading-none">{value}</span>
        {unit && <span className="text-ink-2 text-[12px] pb-0.5">{unit}</span>}
      </span>
      {d !== null && d !== 0 ? (
        <span className={clsx("num text-[12px] font-bold flex items-center gap-1", d > 0 ? "text-[#1a8f5f]" : "text-error")}>
          {d > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {points ? `${d > 0 ? "+" : ""}${d} نقطة` : rel !== null ? `${d > 0 ? "+" : ""}${rel}%` : `${d > 0 ? "+" : ""}${kd(d)}`}
        </span>
      ) : sub ? (
        <span className="text-ink-2 text-[12px] truncate">{sub}</span>
      ) : (
        <span className="text-ink-2 text-[12px]">&nbsp;</span>
      )}
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-navy font-extrabold text-[16px]">{title}</h2>
      {sub && <p className="text-ink-2 text-[12.5px] mb-3">{sub}</p>}
      {children}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-silver-100/70 p-3">
      <div className="text-ink-2 text-[12px] font-bold">{label}</div>
      <div className="num text-navy font-extrabold text-[22px] leading-none mt-1">{value}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-ink-2 text-[13px] rounded-lg bg-silver-100/70 px-3 py-6 text-center">{children}</div>;
}
