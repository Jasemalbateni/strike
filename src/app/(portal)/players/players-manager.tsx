"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { format, parseISO, subDays, differenceInCalendarDays } from "date-fns";
import clsx from "clsx";
import { AlertTriangle, Archive, ArchiveRestore, BadgeCheck, ClipboardCheck, FlaskConical, MessageCircle, Pencil, Phone, Plus, RefreshCw, Search, Sparkles, Trash2, TrendingUp, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, EmptyState } from "@/components/ui";
import { useConfirm } from "@/components/confirm";
import {
  SOURCES,
  SUB_LABEL,
  fmtDate,
  nextStartDate,
  nthSessionDate,
  subState,
  telLink,
  waLink,
  type Branch,
  type Group,
  type Player,
  type PlayerStats,
  type SubState,
  type Subscription,
} from "@/lib/players";

type Props = {
  me: { id: string; isOwner: boolean };
  today: string;
  branches: Branch[];
  groups: Group[];
  initialPlayers: Player[];
  initialSubs: Subscription[];
  stats: PlayerStats[];
};

type Filter = "all" | SubState | "trial" | "archived";
type Period = "30" | "90" | "365" | "all";

const FILTERS: { v: Filter; label: string }[] = [
  { v: "all", label: "الكل" },
  { v: "active", label: "مشترك" },
  { v: "expiring", label: "ينتهي قريباً" },
  { v: "expired", label: "منتهي" },
  { v: "trial", label: "تجربة" },
  { v: "archived", label: "الأرشيف" },
];

const PERIODS: { v: Period; label: string }[] = [
  { v: "30", label: "30 يوم" },
  { v: "90", label: "3 أشهر" },
  { v: "365", label: "سنة" },
  { v: "all", label: "الكل" },
];

const STATE_CHIP: Record<SubState, string> = {
  active: "bg-ice-100 text-navy",
  expiring: "bg-gold-100 text-navy-900",
  expired: "bg-error text-white",
  none: "bg-silver-100 text-ink-2",
};

const fmtKD = (n: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n)} د.ك`;

type Row = { p: Player; sub: Subscription | undefined; st: { state: SubState; daysLeft: number | null }; stats: PlayerStats | undefined };

export default function PlayersManager({ me, today, branches, groups, initialPlayers, initialSubs, stats }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const [players, setPlayers] = useState(initialPlayers);
  const [subs, setSubs] = useState(initialSubs);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [branchId, setBranchId] = useState<string | null>(branches.length > 1 ? null : branches[0]?.id ?? null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("90");
  const [periodStats, setPeriodStats] = useState<{ sessions: number; attendances: number; pitch_cost: number; revenue: number; spend: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState<{ player?: Player } | null>(null);
  const [subForm, setSubForm] = useState<{ player: Player; convert: boolean } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2500);
  }

  /* ---------- realtime ---------- */
  useEffect(() => {
    const ch = supabase
      .channel("players-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, (p) => {
        if (p.eventType === "DELETE") setPlayers((a) => a.filter((x) => x.id !== (p.old as Player).id));
        else {
          const row = p.new as Player;
          setPlayers((a) => (a.some((x) => x.id === row.id) ? a.map((x) => (x.id === row.id ? row : x)) : [...a, row]).sort((x, y) => x.full_name.localeCompare(y.full_name, "ar")));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, (p) => {
        if (p.eventType === "DELETE") setSubs((a) => a.filter((x) => x.id !== (p.old as Subscription).id));
        else {
          const row = p.new as Subscription;
          setSubs((a) => (a.some((x) => x.id === row.id) ? a.map((x) => (x.id === row.id ? row : x)) : [row, ...a]));
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase]);

  /* ---------- period totals (sessions, pitch cost, revenue, marketing spend) ---------- */
  const periodFrom = period === "all" ? "2000-01-01" : format(subDays(parseISO(today), Number(period)), "yyyy-MM-dd");
  useEffect(() => {
    let alive = true;
    supabase.rpc("period_stats", { p_from: periodFrom, p_to: today }).then(({ data }) => {
      if (alive) setPeriodStats((data as typeof periodStats) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [supabase, periodFrom, today]);

  /* ---------- derived ---------- */
  const statsById = useMemo(() => new Map(stats.map((s) => [s.player_id, s])), [stats]);
  const latestSub = (pid: string) => subs.filter((s) => s.player_id === pid).sort((a, b) => b.end_date.localeCompare(a.end_date))[0];

  const rows: Row[] = useMemo(
    () =>
      players.map((p) => {
        const sub = latestSub(p.id);
        return { p, sub, st: p.kind === "trial" ? { state: "none" as const, daysLeft: null } : subState(sub, today), stats: statsById.get(p.id) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, subs, today, statsById],
  );

  const live = rows.filter((r) => !r.p.archived);
  const expired = live.filter((r) => r.p.kind === "subscriber" && r.st.state === "expired").sort((a, b) => (a.st.daysLeft ?? 0) - (b.st.daysLeft ?? 0));
  const expiring = live.filter((r) => r.p.kind === "subscriber" && r.st.state === "expiring").sort((a, b) => (a.st.daysLeft ?? 0) - (b.st.daysLeft ?? 0));
  const noSub = live.filter((r) => r.p.kind === "subscriber" && r.st.state === "none");
  const trials = live.filter((r) => r.p.kind === "trial").sort((a, b) => (b.p.trial_date ?? "").localeCompare(a.p.trial_date ?? ""));
  const active = live.filter((r) => r.p.kind === "subscriber" && r.st.state === "active");

  // trial funnel for the selected period: registered → attended at least once → subscribed
  const funnel = useMemo(() => {
    const inPeriod = (d: string | null | undefined) => !!d && d >= periodFrom && d <= today;
    const registered = rows.filter((r) => (r.p.kind === "trial" || r.p.converted_at) && inPeriod(r.p.trial_date ?? r.p.created_at.slice(0, 10)));
    const attended = registered.filter((r) => (r.stats?.present_count ?? 0) > 0);
    const converted = registered.filter((r) => r.p.kind === "subscriber" && r.p.converted_at);
    return { registered: registered.length, attended: attended.length, converted: converted.length };
  }, [rows, periodFrom, today]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (filter === "archived" ? r.p.archived : !r.p.archived))
      .filter((r) => !branchId || r.p.branch_id === branchId)
      .filter((r) => !groupId || r.p.group_id === groupId)
      .filter((r) => {
        if (filter === "all" || filter === "archived") return true;
        if (filter === "trial") return r.p.kind === "trial";
        return r.p.kind === "subscriber" && r.st.state === filter;
      })
      .filter((r) => !needle || r.p.full_name.toLowerCase().includes(needle) || r.p.guardian_name.toLowerCase().includes(needle) || r.p.guardian_phone.includes(needle));
  }, [rows, filter, branchId, groupId, q]);

  const detail = detailId ? rows.find((r) => r.p.id === detailId) : undefined;
  const branchOf = (id: string | null) => branches.find((b) => b.id === id);
  const groupOf = (id: string | null) => groups.find((g) => g.id === id);

  /* ---------- actions ---------- */
  async function archive(p: Player, archived: boolean) {
    if (archived && !(await confirm({ title: `أرشفة ${p.full_name}؟`, message: "يختفي من قائمة الحضور ويبقى بسجله وتاريخه. تقدر ترجّعه من الأرشيف.", confirmText: "أرشفة", danger: true }))) return;
    setPlayers((a) => a.map((x) => (x.id === p.id ? { ...x, archived } : x)));
    const { error } = await supabase.from("players").update({ archived }).eq("id", p.id);
    if (error) flash("تعذر الحفظ");
    else if (archived) setDetailId(null);
  }

  async function removePlayer(p: Player) {
    if (!(await confirm({ title: `حذف ${p.full_name} نهائياً؟`, message: "يُحذف مع كل اشتراكاته وسجل حضوره. ما ينفع التراجع — الأرشفة أأمن.", confirmText: "حذف نهائي", danger: true }))) return;
    const { error } = await supabase.from("players").delete().eq("id", p.id);
    if (error) return flash("تعذر الحذف");
    setPlayers((a) => a.filter((x) => x.id !== p.id));
    setDetailId(null);
  }

  async function removeSub(s: Subscription) {
    if (!(await confirm({ title: "حذف هذا الاشتراك؟", message: `${fmtDate(s.start_date)} → ${fmtDate(s.end_date)} · ${fmtKD(s.amount)}`, confirmText: "حذف", danger: true }))) return;
    const { error } = await supabase.from("subscriptions").delete().eq("id", s.id);
    if (error) return flash("تعذر الحذف");
    setSubs((a) => a.filter((x) => x.id !== s.id));
  }

  function onPlayerSaved(p: Player, isNew: boolean) {
    setPlayers((a) => (a.some((x) => x.id === p.id) ? a.map((x) => (x.id === p.id ? p : x)) : [...a, p]).sort((x, y) => x.full_name.localeCompare(y.full_name, "ar")));
    setForm(null);
    // a brand-new subscriber gets his first subscription right away
    if (isNew && p.kind === "subscriber") setSubForm({ player: p, convert: false });
  }

  function onSubSaved(s: Subscription, player: Player | null) {
    setSubs((a) => [s, ...a.filter((x) => x.id !== s.id)]);
    if (player) setPlayers((a) => a.map((x) => (x.id === player.id ? player : x)));
    setSubForm(null);
  }

  const alertCount = expired.length + expiring.length + trials.length + noSub.length;

  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 max-w-6xl">
      {/* header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="display text-navy text-[26px] sm:text-[36px] leading-none">اللاعبين</h1>
          <p className="text-ink-2 text-sm mt-1.5">
            <span className="num">{active.length}</span> مشترك فعّال · <span className="num">{trials.length}</span> تجربة · <span className="num">{live.length}</span> إجمالي
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/attendance" className="btn-outline h-10 px-3 text-sm shrink-0">
            <ClipboardCheck size={16} /> <span className="hidden sm:inline">الحضور</span>
          </Link>
          <button onClick={() => setForm({})} className="btn-primary h-10 px-3.5 text-sm whitespace-nowrap shrink-0">
            <Plus size={16} /> لاعب جديد
          </button>
        </div>
      </div>

      {/* alerts */}
      {alertCount > 0 && (
        <div className="grid gap-3 md:grid-cols-2 mb-5">
          {expired.length > 0 && (
            <AlertCard tone="error" icon={<AlertTriangle size={16} />} title="انتهى اشتراكهم" count={expired.length}>
              {expired.map((r) => (
                <AlertRow key={r.p.id} name={r.p.full_name} meta={`انتهى منذ ${Math.abs(r.st.daysLeft ?? 0)} يوم · ${fmtDate(r.sub!.end_date)}`} onOpen={() => setDetailId(r.p.id)}>
                  <button onClick={() => setSubForm({ player: r.p, convert: false })} className="btn-primary h-8 px-2.5 text-xs">
                    <RefreshCw size={13} /> تجديد
                  </button>
                </AlertRow>
              ))}
            </AlertCard>
          )}
          {expiring.length > 0 && (
            <AlertCard tone="gold" icon={<AlertTriangle size={16} />} title="ينتهي خلال ٧ أيام" count={expiring.length}>
              {expiring.map((r) => (
                <AlertRow key={r.p.id} name={r.p.full_name} meta={r.st.daysLeft === 0 ? `ينتهي اليوم · ${fmtDate(r.sub!.end_date)}` : `باقي ${r.st.daysLeft} يوم · ${fmtDate(r.sub!.end_date)}`} onOpen={() => setDetailId(r.p.id)}>
                  <button onClick={() => setSubForm({ player: r.p, convert: false })} className="btn-outline h-8 px-2.5 text-xs">
                    <RefreshCw size={13} /> تجديد
                  </button>
                </AlertRow>
              ))}
            </AlertCard>
          )}
          {trials.length > 0 && (
            <AlertCard tone="ice" icon={<FlaskConical size={16} />} title="تجارب بانتظار القرار" count={trials.length}>
              {trials.map((r) => (
                <AlertRow
                  key={r.p.id}
                  name={r.p.full_name}
                  meta={[r.p.trial_date ? `جرّب ${fmtDate(r.p.trial_date)}` : null, `حضر ${r.stats?.present_count ?? 0} حصة`, r.p.source || null].filter(Boolean).join(" · ")}
                  onOpen={() => setDetailId(r.p.id)}
                >
                  <button onClick={() => setSubForm({ player: r.p, convert: true })} className="btn-accent h-8 px-2.5 text-xs">
                    <BadgeCheck size={13} /> اشتراك
                  </button>
                  <button onClick={() => archive(r.p, true)} className="btn-ghost h-9 w-9 px-0 text-ink-2" aria-label="أرشفة" title="ما اشترك — أرشفة">
                    <Archive size={14} />
                  </button>
                </AlertRow>
              ))}
            </AlertCard>
          )}
          {noSub.length > 0 && (
            <AlertCard tone="silver" icon={<AlertTriangle size={16} />} title="مشترك بدون اشتراك مسجّل" count={noSub.length}>
              {noSub.map((r) => (
                <AlertRow key={r.p.id} name={r.p.full_name} meta="أضف اشتراكه ليظهر بالتنبيهات" onOpen={() => setDetailId(r.p.id)}>
                  <button onClick={() => setSubForm({ player: r.p, convert: false })} className="btn-outline h-8 px-2.5 text-xs">
                    <Plus size={13} /> اشتراك
                  </button>
                </AlertRow>
              ))}
            </AlertCard>
          )}
        </div>
      )}

      <div className="flex flex-col gap-5">
      {/* funnel + money — analytics go below the list on phones, above it on wider screens */}
      <div className="card p-4 sm:p-5 order-3 md:order-1">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-navy font-extrabold text-[16px] flex items-center gap-2 whitespace-nowrap">
            <TrendingUp size={18} className="text-ice-600" /> التجارب والتكلفة
          </h2>
          <div className="flex gap-1">
            {PERIODS.map((o) => (
              <button key={o.v} onClick={() => setPeriod(o.v)} className={clsx("chip px-2.5 h-8 text-[12px] whitespace-nowrap num", period === o.v ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Funnel n={funnel.registered} label="سجّلوا تجربة" />
          <Funnel n={funnel.attended} label="حضروا" pct={funnel.registered ? funnel.attended / funnel.registered : null} />
          <Funnel n={funnel.converted} label="اشتركوا" pct={funnel.registered ? funnel.converted / funnel.registered : null} accent />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Money label="تكلفة التسويق / مشترك جديد" value={periodStats && funnel.converted ? fmtKD(periodStats.spend / funnel.converted) : "—"} hint={periodStats ? `إنفاق ${fmtKD(periodStats.spend)}` : "من متابعة التسويق"} />
          <Money label="إيراد الاشتراكات" value={periodStats ? fmtKD(periodStats.revenue) : "—"} hint="اشتراكات بدأت بالفترة" />
          <Money label="تكلفة الملعب / حضور" value={periodStats && periodStats.attendances ? fmtKD(periodStats.pitch_cost / periodStats.attendances) : "—"} hint={periodStats ? `${periodStats.sessions} حصة · ${fmtKD(periodStats.pitch_cost)}` : ""} />
          <Money label="متوسط الحضور / حصة" value={periodStats && periodStats.sessions ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(periodStats.attendances / periodStats.sessions) : "—"} hint={periodStats ? `${periodStats.attendances} حضور` : ""} />
        </div>
        <p className="text-ink-2 text-[11px] mt-3">تكلفة التسويق تُحسب من خانة «الإنفاق» في متابعة مركز التسويق ÷ التجارب اللي اشتركت بالفترة. تكلفة الملعب من إيجار الحصة المسجّل بالفرع.</p>
      </div>

      {/* filters + list */}
      <div className="order-1 md:order-2">
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex flex-wrap gap-2">
          <label className="field h-11 flex items-center gap-2 flex-1 min-w-[200px] py-0">
            <Search size={16} className="text-ink-2 shrink-0" />
            <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="بحث بالاسم أو ولي الأمر أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <button onClick={() => setQ("")} className="text-ink-2 h-8 w-8 grid place-items-center" aria-label="مسح">
                <X size={14} />
              </button>
            )}
          </label>
          {branches.length > 1 && (
            <select className="field w-auto h-11" value={branchId ?? ""} onChange={(e) => { setBranchId(e.target.value || null); setGroupId(null); }}>
              <option value="">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto md:flex-wrap md:overflow-visible tabs-scroll -mx-4 px-4 md:mx-0 md:px-0 pb-1 [scrollbar-width:none]">
          {FILTERS.map((f) => {
            const n = f.v === "archived" ? rows.filter((r) => r.p.archived).length : f.v === "all" ? live.length : f.v === "trial" ? trials.length : f.v === "active" ? active.length : f.v === "expiring" ? expiring.length : f.v === "expired" ? expired.length : noSub.length;
            return (
              <button key={f.v} onClick={() => setFilter(f.v)} className={clsx("chip px-3 h-9 text-[13px] gap-1.5 shrink-0 whitespace-nowrap", filter === f.v ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
                {f.label} <span className={clsx("num text-[11px]", filter === f.v ? "text-ice" : "text-ink-2")}>{n}</span>
              </button>
            );
          })}
          {groups.filter((g) => !branchId || g.branch_id === branchId).length > 0 && <span className="w-px bg-silver-200 mx-1 self-stretch shrink-0" />}
          {groups
            .filter((g) => !branchId || g.branch_id === branchId)
            .map((g) => (
              <button key={g.id} onClick={() => setGroupId(groupId === g.id ? null : g.id)} className={clsx("chip px-3 h-9 text-[13px] shrink-0 whitespace-nowrap", groupId === g.id ? "bg-ice text-navy-900" : "bg-white border border-silver-200 text-navy")}>
                {g.name}
              </button>
            ))}
        </div>
      </div>

      {/* list */}
      {visible.length === 0 ? (
        <EmptyState title={filter === "archived" ? "الأرشيف فاضي" : "لا يوجد لاعبون"} hint={q ? "جرّب كلمة بحث ثانية" : "أضف لاعباً جديداً من الزر أعلى الصفحة"} />
      ) : (
        <>
          {/* phones: cards */}
          <div className="grid gap-2 md:hidden">
            {visible.map((r) => (
              <PlayerCard key={r.p.id} r={r} group={groupOf(r.p.group_id)?.name} onOpen={() => setDetailId(r.p.id)} onRenew={() => setSubForm({ player: r.p, convert: r.p.kind === "trial" })} />
            ))}
          </div>
          {/* tablets / laptops: table */}
          <div className="hidden md:block card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-silver-100/70 text-ink-2 text-[12px]">
                <tr>
                  <th className="text-start font-bold px-4 py-2.5">اللاعب</th>
                  <th className="text-start font-bold px-3 py-2.5">الفئة</th>
                  <th className="text-start font-bold px-3 py-2.5">ولي الأمر</th>
                  <th className="text-start font-bold px-3 py-2.5">الاشتراك</th>
                  <th className="text-start font-bold px-3 py-2.5">الحضور</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const total = (r.stats?.present_count ?? 0) + (r.stats?.absent_count ?? 0);
                  return (
                    <tr key={r.p.id} className="border-t border-silver-200 hover:bg-navy-50/40 cursor-pointer" onClick={() => setDetailId(r.p.id)}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className={clsx("h-9 w-9 rounded-full grid place-items-center font-extrabold shrink-0", r.p.kind === "trial" ? "bg-gold text-navy-900" : "bg-navy-50 text-navy")}>{r.p.kind === "trial" ? <FlaskConical size={15} /> : r.p.full_name.trim()[0]}</span>
                          <div className="min-w-0">
                            <div className="font-extrabold text-navy truncate">{r.p.full_name}</div>
                            <div className="text-ink-2 text-[11px]">{[r.p.age ? `${r.p.age} سنوات` : null, r.p.source || null].filter(Boolean).join(" · ")}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-navy font-bold whitespace-nowrap">{groupOf(r.p.group_id)?.name ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <div className="text-navy font-bold truncate max-w-[160px]">{r.p.guardian_name || "—"}</div>
                        {r.p.guardian_phone && <PhoneLinks phone={r.p.guardian_phone} compact />}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.p.kind === "trial" ? (
                          <span className="chip bg-gold text-navy-900">تجربة{r.p.trial_date ? ` · ${fmtDate(r.p.trial_date)}` : ""}</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className={clsx("chip", STATE_CHIP[r.st.state])}>{SUB_LABEL[r.st.state]}</span>
                            {r.sub && <span className="num text-ink-2 text-xs">{fmtDate(r.sub.end_date)}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="num text-navy font-bold">{r.stats?.present_count ?? 0}</span>
                        <span className="text-ink-2 text-xs"> / {total}</span>
                        {total > 0 && <span className="num text-ink-2 text-xs ms-1">({Math.round(((r.stats?.present_count ?? 0) / total) * 100)}%)</span>}
                      </td>
                      <td className="px-3 py-2.5 text-end whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {r.p.archived ? (
                          <button onClick={() => archive(r.p, false)} className="btn-outline h-8 px-2.5 text-xs">
                            <ArchiveRestore size={13} /> استرجاع
                          </button>
                        ) : r.p.kind === "trial" ? (
                          <button onClick={() => setSubForm({ player: r.p, convert: true })} className="btn-accent h-8 px-2.5 text-xs">
                            <BadgeCheck size={13} /> اشتراك
                          </button>
                        ) : (
                          <button onClick={() => setSubForm({ player: r.p, convert: false })} className={clsx("h-8 px-2.5 text-xs", r.st.state === "active" ? "btn-ghost" : "btn-primary")}>
                            <RefreshCw size={13} /> تجديد
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      </div>
      </div>

      {toast && <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] md:bottom-6 inset-x-4 md:inset-x-auto md:end-6 z-[60] rounded-xl bg-error text-white px-4 py-2.5 text-sm font-bold shadow-[var(--shadow-pop)] fade-up text-center">{toast}</div>}

      {/* detail */}
      {detail && (
        <PlayerDetail
          r={detail}
          subs={subs.filter((s) => s.player_id === detail.p.id).sort((a, b) => b.start_date.localeCompare(a.start_date))}
          branch={branchOf(detail.p.branch_id)}
          group={groupOf(detail.p.group_id)}
          isOwner={me.isOwner}
          onClose={() => setDetailId(null)}
          onEdit={() => setForm({ player: detail.p })}
          onRenew={() => setSubForm({ player: detail.p, convert: detail.p.kind === "trial" })}
          onArchive={() => archive(detail.p, !detail.p.archived)}
          onDelete={() => removePlayer(detail.p)}
          onDeleteSub={removeSub}
        />
      )}

      {form && <PlayerFormModal key={form.player?.id ?? "new"} player={form.player} branches={branches} groups={groups} today={today} onClose={() => setForm(null)} onSaved={onPlayerSaved} onError={flash} />}

      {subForm && (
        <SubscriptionFormModal
          key={subForm.player.id}
          player={subForm.player}
          convert={subForm.convert}
          branch={branchOf(subForm.player.branch_id) ?? branches[0]}
          latest={latestSub(subForm.player.id)}
          lastAmount={subs[0]?.amount ?? 40}
          today={today}
          onClose={() => setSubForm(null)}
          onSaved={onSubSaved}
          onError={flash}
        />
      )}
    </div>
  );
}

/* ====================== pieces ====================== */

const ALERT_LIMIT = 4;
function AlertCard({ tone, icon, title, count, children }: { tone: "error" | "gold" | "ice" | "silver"; icon: React.ReactNode; title: string; count: number; children: React.ReactNode[] }) {
  const [all, setAll] = useState(false);
  const cls = { error: "border-error/40 bg-error-100/50 text-error", gold: "border-gold/60 bg-gold-100/60 text-navy-900", ice: "border-ice/50 bg-ice-50 text-navy", silver: "border-silver-200 bg-white text-ink-2" }[tone];
  const shown = all ? children : children.slice(0, ALERT_LIMIT);
  return (
    <div className={clsx("rounded-2xl border-2 p-3", cls)}>
      <div className="flex items-center gap-2 font-extrabold text-[14px] mb-2">
        {icon} {title} <span className="num text-[13px] opacity-80">{count}</span>
      </div>
      <div className="grid gap-1.5">{shown}</div>
      {children.length > ALERT_LIMIT && (
        <button onClick={() => setAll((v) => !v)} className="mt-2 text-[12.5px] font-bold underline underline-offset-4 opacity-90">
          {all ? "عرض أقل" : `عرض الكل (${children.length})`}
        </button>
      )}
    </div>
  );
}

function AlertRow({ name, meta, onOpen, children }: { name: string; meta: string; onOpen: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2">
      <button onClick={onOpen} className="flex-1 min-w-0 text-start">
        <div className="font-extrabold text-navy text-[14px] truncate">{name}</div>
        <div className="text-ink-2 text-[11.5px] num">{meta}</div>
      </button>
      <div className="flex items-center gap-1 shrink-0">{children}</div>
    </div>
  );
}

function Funnel({ n, label, pct, accent }: { n: number; label: string; pct?: number | null; accent?: boolean }) {
  return (
    <div className={clsx("rounded-xl px-3 py-2.5", accent ? "bg-navy text-white" : "bg-navy-50 text-navy")}>
      <div className="flex items-baseline gap-1.5">
        <span className="num text-[26px] font-bold leading-none">{n}</span>
        {pct != null && <span className={clsx("num text-[12px] font-bold", accent ? "text-ice" : "text-ink-2")}>{Math.round(pct * 100)}%</span>}
      </div>
      <div className={clsx("text-[12px] font-bold mt-1", accent ? "text-silver" : "text-ink-2")}>{label}</div>
    </div>
  );
}

function Money({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-silver-200 px-3 py-2.5 flex flex-col">
      <div className="text-ink-2 text-[11.5px] font-bold leading-tight">{label}</div>
      <div className="num text-navy text-[20px] font-bold leading-none mt-auto pt-2">{value}</div>
      <div className="num text-ink-2 text-[11px] mt-1 min-h-[14px]">{hint}</div>
    </div>
  );
}

function PhoneLinks({ phone, compact }: { phone: string; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <a href={telLink(phone)} className={clsx("inline-flex items-center gap-1 rounded-lg text-navy font-bold hover:bg-navy-50 num", compact ? "text-[12px] px-1 h-7" : "btn-outline h-11 px-3 text-sm")} dir="ltr">
        <Phone size={compact ? 12 : 15} /> {phone}
      </a>
      <a href={waLink(phone)} target="_blank" rel="noreferrer" className={clsx("inline-grid place-items-center rounded-lg text-navy hover:bg-ice-100", compact ? "h-7 w-7" : "h-11 w-11 rounded-xl border border-silver-200 bg-white")} aria-label="واتساب" title="واتساب">
        <MessageCircle size={compact ? 14 : 18} />
      </a>
    </span>
  );
}

function PlayerCard({ r, group, onOpen, onRenew }: { r: Row; group?: string; onOpen: () => void; onRenew: () => void }) {
  const trial = r.p.kind === "trial";
  const total = (r.stats?.present_count ?? 0) + (r.stats?.absent_count ?? 0);
  return (
    <div className={clsx("card px-3 py-2.5 flex items-center gap-3", trial && "border-gold/60 bg-gold-100/30", r.p.archived && "opacity-70")}>
      <button onClick={onOpen} className="flex-1 min-w-0 text-start flex items-center gap-3 min-h-11">
        <span className={clsx("h-10 w-10 rounded-full grid place-items-center font-extrabold shrink-0", trial ? "bg-gold text-navy-900" : r.st.state === "expired" ? "bg-error text-white" : "bg-navy-50 text-navy")}>{trial ? <FlaskConical size={16} /> : r.p.full_name.trim()[0]}</span>
        <span className="min-w-0">
          <span className="block font-extrabold text-navy text-[15px] leading-tight truncate">{r.p.full_name}</span>
          <span className="flex items-center gap-1.5 mt-1 flex-wrap">
            {trial ? <span className="chip bg-gold text-navy-900 px-1.5 text-[10px]">تجربة</span> : <span className={clsx("chip px-1.5 text-[10px]", STATE_CHIP[r.st.state])}>{SUB_LABEL[r.st.state]}</span>}
            {group && <span className="text-ink-2 text-[11px]">{group}</span>}
            {r.sub && !trial && <span className="num text-ink-2 text-[11px]">→ {fmtDate(r.sub.end_date)}</span>}
            {total > 0 && (
              <span className="num text-ink-2 text-[11px]">
                حضور {r.stats?.present_count}/{total}
              </span>
            )}
          </span>
        </span>
      </button>
      {!r.p.archived && (
        <button onClick={onRenew} className={clsx("h-9 px-2.5 text-xs shrink-0", trial ? "btn-accent" : r.st.state === "active" ? "btn-ghost" : "btn-primary")}>
          {trial ? <BadgeCheck size={13} /> : <RefreshCw size={13} />} {trial ? "اشتراك" : "تجديد"}
        </button>
      )}
    </div>
  );
}

/* ---------- detail ---------- */
function PlayerDetail({ r, subs, branch, group, isOwner, onClose, onEdit, onRenew, onArchive, onDelete, onDeleteSub }: { r: Row; subs: Subscription[]; branch?: Branch; group?: Group; isOwner: boolean; onClose: () => void; onEdit: () => void; onRenew: () => void; onArchive: () => void; onDelete: () => void; onDeleteSub: (s: Subscription) => void }) {
  const p = r.p;
  const trial = p.kind === "trial";
  const total = (r.stats?.present_count ?? 0) + (r.stats?.absent_count ?? 0);
  return (
    <Modal
      open
      onClose={onClose}
      title={p.full_name}
      footer={
        <div className="w-full flex flex-wrap items-center gap-2">
          <button onClick={onArchive} className="btn-ghost h-10 px-2.5 text-sm whitespace-nowrap">
            {p.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} {p.archived ? "استرجاع" : "أرشفة"}
          </button>
          {isOwner && (
            <button onClick={onDelete} className="btn-danger h-10 px-2.5 text-sm whitespace-nowrap">
              <Trash2 size={15} /> حذف
            </button>
          )}
          <div className="ms-auto flex gap-2">
            <button onClick={onEdit} className="btn-outline h-10 px-3 text-sm whitespace-nowrap">
              <Pencil size={15} /> تعديل
            </button>
            {!p.archived && (
              <button onClick={onRenew} className={clsx("h-10 px-3 text-sm whitespace-nowrap", trial ? "btn-accent" : "btn-primary")}>
                {trial ? <BadgeCheck size={15} /> : <RefreshCw size={15} />} {trial ? "تحويل لمشترك" : "تجديد"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {trial ? <span className="chip bg-gold text-navy-900">تجربة</span> : <span className={clsx("chip", STATE_CHIP[r.st.state])}>{SUB_LABEL[r.st.state]}</span>}
        {p.archived && <span className="chip bg-silver-200 text-navy-900">مؤرشف</span>}
        {group && <span className="chip bg-navy-50 text-navy">{group.name}</span>}
        {branch && <span className="chip bg-silver-100 text-ink-2">{branch.name}</span>}
        {p.age && <span className="chip bg-silver-100 text-ink-2 num">{p.age} سنوات</span>}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-silver-200 p-3">
          <div className="text-ink-2 text-[11.5px] font-bold mb-1">ولي الأمر</div>
          <div className="font-extrabold text-navy">{p.guardian_name || "—"}</div>
          {p.guardian_phone ? <div className="mt-2"><PhoneLinks phone={p.guardian_phone} /></div> : <div className="text-ink-2 text-xs mt-1">لا يوجد رقم</div>}
        </div>
        <div className="rounded-xl border border-silver-200 p-3">
          <div className="text-ink-2 text-[11.5px] font-bold mb-1">الحضور</div>
          <div className="flex items-baseline gap-2">
            <span className="num text-navy text-[24px] font-bold leading-none">{r.stats?.present_count ?? 0}</span>
            <span className="text-ink-2 text-xs">حضور</span>
            <span className="num text-error text-[18px] font-bold leading-none ms-2">{r.stats?.absent_count ?? 0}</span>
            <span className="text-ink-2 text-xs">غياب</span>
            {total > 0 && <span className="num text-ink-2 text-xs ms-auto">{Math.round(((r.stats?.present_count ?? 0) / total) * 100)}%</span>}
          </div>
          <div className="text-ink-2 text-[11.5px] mt-1.5 num">
            {r.stats?.late_count ? `${r.stats.late_count} تأخير · ` : ""}
            {r.stats?.last_present ? `آخر حضور ${fmtDate(r.stats.last_present)}` : "لم يحضر بعد"}
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-4 text-sm">
        <Info label="المصدر" value={p.source || "—"} />
        <Info label={trial ? "تاريخ التجربة" : "بدأ كتجربة"} value={p.trial_date ? fmtDate(p.trial_date) : "—"} />
        {p.converted_at && <Info label="تحوّل لمشترك" value={fmtDate(p.converted_at)} />}
        <Info label="أُضيف" value={fmtDate(p.created_at.slice(0, 10))} />
      </div>

      {p.notes && <div className="rounded-xl bg-silver-100/70 p-3 text-sm text-navy whitespace-pre-wrap mb-4">{p.notes}</div>}

      <div className="text-ink-2 text-[11.5px] font-bold mb-1.5">الاشتراكات <span className="num">{subs.length}</span></div>
      {subs.length === 0 ? (
        <div className="text-ink-2 text-sm">لا يوجد اشتراك مسجّل.</div>
      ) : (
        <div className="grid gap-1.5">
          {subs.map((s, i) => (
            <div key={s.id} className={clsx("rounded-xl border px-3 py-2 flex items-center gap-2", i === 0 ? "border-ice bg-ice-50" : "border-silver-200")}>
              <div className="flex-1 min-w-0 num text-[13px]">
                <span className="font-bold text-navy">{fmtDate(s.start_date)}</span> <span className="text-ink-2">→</span> <span className="font-bold text-navy">{fmtDate(s.end_date)}</span>
                <span className="text-ink-2"> · {s.sessions_count} حصة · {fmtKD(s.amount)}</span>
                {!s.paid && <span className="chip bg-error-100 text-error ms-2 text-[10px]">غير مدفوع</span>}
                {s.notes && <div className="text-ink-2 text-[11.5px] truncate">{s.notes}</div>}
              </div>
              {isOwner && (
                <button onClick={() => onDeleteSub(s)} className="h-8 w-8 grid place-items-center rounded-lg text-ink-2 hover:text-error hover:bg-error-100" aria-label="حذف الاشتراك">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-silver-200/70 py-1.5">
      <span className="text-ink-2">{label}</span>
      <span className="font-bold text-navy num">{value}</span>
    </div>
  );
}

/* ---------- player form ---------- */
function PlayerFormModal({ player, branches, groups, today, onClose, onSaved, onError }: { player?: Player; branches: Branch[]; groups: Group[]; today: string; onClose: () => void; onSaved: (p: Player, isNew: boolean) => void; onError: (m: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState(player?.full_name ?? "");
  const [age, setAge] = useState(player?.age ? String(player.age) : "");
  const [branchId, setBranchId] = useState(player?.branch_id ?? branches[0]?.id ?? "");
  const [groupId, setGroupId] = useState(player?.group_id ?? "");
  const [kind, setKind] = useState<Player["kind"]>(player?.kind ?? "subscriber");
  const [source, setSource] = useState(player?.source ?? "");
  const [trialDate, setTrialDate] = useState(player?.trial_date ?? today);
  const [gName, setGName] = useState(player?.guardian_name ?? "");
  const [gPhone, setGPhone] = useState(player?.guardian_phone ?? "");
  const [notes, setNotes] = useState(player?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const branchGroups = groups.filter((g) => g.branch_id === branchId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const payload = {
      full_name: name.trim(),
      age: age ? Number(age) : null,
      branch_id: branchId || null,
      group_id: groupId || null,
      kind,
      source: source.trim(),
      trial_date: kind === "trial" || player?.trial_date ? trialDate || null : null,
      guardian_name: gName.trim(),
      guardian_phone: gPhone.trim(),
      notes: notes.trim(),
    };
    const res = player ? await supabase.from("players").update(payload).eq("id", player.id).select("*").single() : await supabase.from("players").insert(payload).select("*").single();
    setBusy(false);
    if (res.error || !res.data) return onError("تعذر الحفظ — تحقق من الاتصال");
    onSaved(res.data as Player, !player);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={player ? "تعديل بيانات اللاعب" : "لاعب جديد"}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button form="player-form" className="btn-primary" disabled={busy}>
            {player ? "حفظ" : kind === "subscriber" ? "التالي: الاشتراك" : "إضافة"}
          </button>
        </>
      }
    >
      <form id="player-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="اسم اللاعب" className="sm:col-span-2">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} required placeholder="الاسم الثلاثي" />
        </Field>
        {!player && (
          <div className="sm:col-span-2 grid grid-cols-2 gap-1 rounded-xl bg-silver-100 p-1">
            {(["subscriber", "trial"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={clsx("h-10 rounded-lg font-bold text-sm transition", kind === k ? (k === "trial" ? "bg-gold text-navy-900" : "bg-navy text-white") : "text-ink-2")}>
                {k === "subscriber" ? "مشترك" : "تجربة"}
              </button>
            ))}
          </div>
        )}
        <Field label="العمر">
          <input className="field num" dir="ltr" type="number" inputMode="numeric" min={3} max={16} value={age} onChange={(e) => setAge(e.target.value)} />
        </Field>
        {branches.length > 1 ? (
          <Field label="الفرع">
            <select className="field" value={branchId} onChange={(e) => { setBranchId(e.target.value); setGroupId(""); }}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="الفئة">
          <select className="field" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">بدون فئة</option>
            {branchGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="اسم ولي الأمر">
          <input className="field" value={gName} onChange={(e) => setGName(e.target.value)} />
        </Field>
        <Field label="هاتف ولي الأمر">
          <input className="field num" dir="ltr" type="tel" inputMode="tel" value={gPhone} onChange={(e) => setGPhone(e.target.value)} placeholder="9XXXXXXX" />
        </Field>
        <Field label="كيف عرفنا؟ (المصدر)">
          <input className="field" list="player-sources" value={source} onChange={(e) => setSource(e.target.value)} placeholder="إعلان انستغرام، توصية…" />
          <datalist id="player-sources">
            {SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        {(kind === "trial" || player?.trial_date) && (
          <Field label="تاريخ التجربة">
            <input className="field num" dir="ltr" type="date" value={trialDate} onChange={(e) => setTrialDate(e.target.value)} />
          </Field>
        )}
        <Field label="ملاحظات" className="sm:col-span-2">
          <textarea className="field min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="حالة صحية، تفضيلات، ملاحظات المدرب…" />
        </Field>
      </form>
    </Modal>
  );
}

/* ---------- subscription form ---------- */
function SubscriptionFormModal({ player, convert, branch, latest, lastAmount, today, onClose, onSaved, onError }: { player: Player; convert: boolean; branch?: Branch; latest?: Subscription; lastAmount: number; today: string; onClose: () => void; onSaved: (s: Subscription, player: Player | null) => void; onError: (m: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const days = branch?.training_days ?? [6, 1, 3];
  const [start, setStart] = useState(convert ? today : nextStartDate(latest, today));
  const [count, setCount] = useState(String(latest?.sessions_count ?? 12));
  const [endTouched, setEndTouched] = useState(false);
  const [endManual, setEndManual] = useState("");
  const [amount, setAmount] = useState(String(latest?.amount ?? lastAmount));
  const [paid, setPaid] = useState(true);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const autoEnd = start && Number(count) > 0 ? nthSessionDate(start, days, Number(count)) : start;
  const end = endTouched ? endManual : autoEnd;
  const gap = latest && start > latest.end_date ? differenceInCalendarDays(parseISO(start), parseISO(latest.end_date)) - 1 : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!start || !end) return;
    setBusy(true);
    const res = await supabase
      .from("subscriptions")
      .insert({ player_id: player.id, start_date: start, end_date: end, sessions_count: Number(count) || 12, amount: Number(amount) || 0, paid, paid_at: paid ? today : null, notes: notes.trim() })
      .select("*")
      .single();
    if (res.error || !res.data) {
      setBusy(false);
      return onError("تعذر حفظ الاشتراك");
    }
    let updated: Player | null = null;
    if (convert) {
      const up = await supabase.from("players").update({ kind: "subscriber", converted_at: start }).eq("id", player.id).select("*").single();
      updated = (up.data as Player) ?? { ...player, kind: "subscriber", converted_at: start };
    }
    setBusy(false);
    onSaved(res.data as Subscription, updated);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={convert ? `اشتراك جديد — ${player.full_name}` : latest ? `تجديد اشتراك ${player.full_name}` : `اشتراك ${player.full_name}`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {convert ? "لاحقاً" : "إلغاء"}
          </button>
          <button form="sub-form" className="btn-primary" disabled={busy}>
            {convert ? <BadgeCheck size={16} /> : <Sparkles size={16} />} {convert ? "تحويل وحفظ" : "حفظ الاشتراك"}
          </button>
        </>
      }
    >
      {convert && <p className="text-sm text-navy bg-gold-100/70 rounded-xl px-3 py-2 mb-4">يتحوّل من «تجربة» إلى «مشترك» ويُحسب ضمن التجارب اللي اشتركت.</p>}
      {latest && !convert && (
        <p className="text-sm text-ink-2 mb-4 num">
          آخر اشتراك: {fmtDate(latest.start_date)} → {fmtDate(latest.end_date)} ({fmtKD(latest.amount)})
          {gap > 0 && <span className="text-gold font-bold"> · فجوة {gap} يوم</span>}
        </p>
      )}
      <form id="sub-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="بداية الاشتراك">
          <input className="field num" dir="ltr" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </Field>
        <Field label="عدد الحصص">
          <input className="field num" dir="ltr" type="number" inputMode="numeric" min={1} max={60} value={count} onChange={(e) => setCount(e.target.value)} required />
        </Field>
        <Field label={endTouched ? "نهاية الاشتراك (يدوي)" : "نهاية الاشتراك (تلقائي)"}>
          <input
            className="field num"
            dir="ltr"
            type="date"
            value={end}
            onChange={(e) => {
              setEndTouched(true);
              setEndManual(e.target.value);
            }}
            required
          />
        </Field>
        <Field label="المبلغ (د.ك)">
          <input className="field num" dir="ltr" type="number" inputMode="decimal" min={0} step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <label className="flex items-center gap-3 sm:col-span-2 cursor-pointer select-none">
          <input type="checkbox" className="h-5 w-5 accent-[var(--navy)]" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          <span className="font-bold text-navy text-sm">مدفوع</span>
          {!paid && <span className="chip bg-error-100 text-error text-[10px]">يظهر كغير مدفوع بسجل اللاعب</span>}
        </label>
        <Field label="ملاحظة" className="sm:col-span-2">
          <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="خصم، دفع جزئي، طريقة الدفع…" />
        </Field>
        <p className="sm:col-span-2 text-ink-2 text-xs">
          النهاية تُحسب تلقائياً حسب أيام تدريب الفرع ({days.map((d) => ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"][d]).join("، ")}) — تقدر تعدّلها يدوياً.
          {endTouched && (
            <button type="button" className="text-ice-600 font-bold ms-1" onClick={() => setEndTouched(false)}>
              رجّع التلقائي
            </button>
          )}
        </p>
      </form>
    </Modal>
  );
}
