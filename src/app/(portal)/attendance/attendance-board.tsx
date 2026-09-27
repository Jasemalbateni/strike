"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronRight, ChevronLeft, Check, X, Clock, UserPlus, Sparkles, AlertTriangle, CalendarX, Users, FlaskConical } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field } from "@/components/ui";
import { useConfirm } from "@/components/confirm";
import { DAY_SHORT, isTrainingDay, subState, trialVisibleOn, type Attendance, type AttendanceStatus, type Branch, type Group, type Player, type Session, type Subscription } from "@/lib/players";

type Props = {
  me: { id: string; name: string; canManage: boolean };
  today: string;
  branches: Branch[];
  groups: Group[];
  initialPlayers: Player[];
  initialSessions: Session[];
  initialAttendance: Attendance[];
  subscriptions: Subscription[];
};

export default function AttendanceBoard({ me, today, branches, groups, initialPlayers, initialSessions, initialAttendance, subscriptions }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const [date, setDate] = useState(today);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [players, setPlayers] = useState(initialPlayers);
  const [sessions, setSessions] = useState(initialSessions);
  const [attendance, setAttendance] = useState(initialAttendance);
  const [toast, setToast] = useState<string | null>(null);
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialName, setTrialName] = useState("");
  const [trialAge, setTrialAge] = useState("");
  const [busy, setBusy] = useState(false);

  const branch = branches.find((b) => b.id === branchId);
  const session = sessions.find((s) => s.branch_id === branchId && s.session_date === date);
  const trainingDay = branch ? isTrainingDay(date, branch.training_days) : true;

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2500);
  }

  // realtime: attendance / players / sessions
  useEffect(() => {
    const ch = supabase
      .channel("attendance-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, (p) => {
        if (p.eventType === "DELETE") setAttendance((a) => a.filter((x) => x.id !== (p.old as Attendance).id));
        else {
          const row = p.new as Attendance;
          setAttendance((a) => (a.some((x) => x.id === row.id) ? a.map((x) => (x.id === row.id ? row : x)) : [...a, row]));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, (p) => {
        if (p.eventType === "DELETE") setPlayers((a) => a.filter((x) => x.id !== (p.old as Player).id));
        else {
          const row = p.new as Player;
          const safe = me.canManage ? row : { ...row, guardian_name: "", guardian_phone: "" };
          setPlayers((a) => {
            const next = a.some((x) => x.id === row.id) ? a.map((x) => (x.id === row.id ? { ...x, ...safe } : x)) : [...a, safe];
            return next.filter((x) => !x.archived).sort((x, y) => x.full_name.localeCompare(y.full_name, "ar"));
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (p) => {
        if (p.eventType === "DELETE") setSessions((a) => a.filter((x) => x.id !== (p.old as Session).id));
        else {
          const row = p.new as Session;
          setSessions((a) => (a.some((x) => x.id === row.id) ? a.map((x) => (x.id === row.id ? row : x)) : [row, ...a]));
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, me.canManage]);

  // make sure attendance rows for the selected session are loaded (older sessions are not preloaded)
  useEffect(() => {
    if (!session) return;
    if (attendance.some((a) => a.session_id === session.id)) return;
    supabase
      .from("attendance")
      .select("*")
      .eq("session_id", session.id)
      .then(({ data }) => {
        if (data?.length) setAttendance((a) => [...a.filter((x) => x.session_id !== session.id), ...(data as Attendance[])]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const latestSub = (pid: string) => subscriptions.filter((s) => s.player_id === pid).sort((a, b) => b.end_date.localeCompare(a.end_date))[0];

  const roster = useMemo(() => {
    return players
      .filter((p) => p.branch_id === branchId && (!groupId || p.group_id === groupId))
      .filter((p) => trialVisibleOn(p, date))
      .map((p) => {
        const a = session ? attendance.find((x) => x.session_id === session.id && x.player_id === p.id) : undefined;
        const st = me.canManage ? subState(latestSub(p.id), date) : { state: "active" as const, daysLeft: null };
        return { p, a, st };
      })
      .sort((x, y) => Number(x.p.kind === "trial") - Number(y.p.kind === "trial") || x.p.full_name.localeCompare(y.p.full_name, "ar"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, branchId, groupId, session, attendance, date, subscriptions]);

  const counts = {
    present: roster.filter((r) => r.a?.status === "present" || r.a?.status === "late").length,
    absent: roster.filter((r) => r.a?.status === "absent" || r.a?.status === "excused").length,
    unmarked: roster.filter((r) => !r.a).length,
    trials: roster.filter((r) => r.p.kind === "trial").length,
  };

  /** the session row for (branch, date) — created on first use. Insert-then-select (not upsert) so coaches,
   *  who may insert but not update sessions, don't hit RLS when a colleague opened it a second earlier. */
  async function ensureSession(): Promise<Session | null> {
    if (session) return session;
    if (!branchId) return null;
    const found = await supabase.from("sessions").select("*").eq("branch_id", branchId).eq("session_date", date).maybeSingle();
    let row = found.data as Session | null;
    if (!row) {
      const ins = await supabase.from("sessions").insert({ branch_id: branchId, session_date: date }).select("*").maybeSingle();
      row = ins.data as Session | null;
      if (!row) {
        // unique violation → someone else just created it
        const again = await supabase.from("sessions").select("*").eq("branch_id", branchId).eq("session_date", date).maybeSingle();
        row = again.data as Session | null;
      }
    }
    if (!row) {
      flash("تعذر فتح الحصة — تحقق من الاتصال");
      return null;
    }
    const s = row;
    setSessions((list) => (list.some((x) => x.id === s.id) ? list : [s, ...list]));
    return s;
  }

  async function mark(playerId: string, status: AttendanceStatus | null) {
    const s = await ensureSession();
    if (!s) return;
    const existing = attendance.find((x) => x.session_id === s.id && x.player_id === playerId);
    if (status === null) {
      if (!existing) return;
      setAttendance((a) => a.filter((x) => x.id !== existing.id));
      const { error } = await supabase.from("attendance").delete().eq("id", existing.id);
      if (error) flash("تعذر الحفظ");
      return;
    }
    const optimistic: Attendance = existing ? { ...existing, status } : { id: "tmp-" + playerId, session_id: s.id, player_id: playerId, status, marked_by: me.id, marked_at: new Date().toISOString() };
    setAttendance((a) => (existing ? a.map((x) => (x.id === existing.id ? optimistic : x)) : [...a, optimistic]));
    const { data, error } = await supabase.from("attendance").upsert({ session_id: s.id, player_id: playerId, status }, { onConflict: "session_id,player_id" }).select("*").single();
    if (error || !data) {
      flash("تعذر الحفظ — تحقق من الاتصال");
      setAttendance((a) => a.filter((x) => x.id !== optimistic.id));
      return;
    }
    setAttendance((a) => a.map((x) => (x.id === optimistic.id || x.id === data.id ? (data as Attendance) : x)).filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i));
  }

  /** tap on the card: none → present → absent → none */
  function cycle(r: (typeof roster)[number]) {
    const cur = r.a?.status;
    if (!cur) return mark(r.p.id, "present");
    if (cur === "present" || cur === "late") return mark(r.p.id, "absent");
    return mark(r.p.id, null);
  }

  async function markAllPresent() {
    if (!(await confirm({ title: "تعليم الكل حاضر؟", message: "اللي ما عليهم علامة بيصيرون «حاضر». تقدر تغيّر أي واحد بعدها.", danger: false, confirmText: "نعم" }))) return;
    for (const r of roster.filter((x) => !x.a)) await mark(r.p.id, "present");
  }

  async function addTrial(e: FormEvent) {
    e.preventDefault();
    if (!trialName.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("players")
      .insert({ branch_id: branchId, group_id: groupId, full_name: trialName.trim(), age: trialAge ? Number(trialAge) : null, kind: "trial", trial_date: date, source: "مرّ بالملعب" })
      .select("*")
      .single();
    setBusy(false);
    if (error || !data) return flash("تعذر إضافة اللاعب");
    setPlayers((p) => [...p, data as Player].sort((x, y) => x.full_name.localeCompare(y.full_name, "ar")));
    setTrialName("");
    setTrialAge("");
    setTrialOpen(false);
    await mark(data.id, "present");
  }

  async function cancelSession() {
    const s = await ensureSession();
    if (!s) return;
    if (!(await confirm({ title: s.cancelled ? "إلغاء إلغاء الحصة؟" : "إلغاء حصة اليوم؟", message: s.cancelled ? "ترجع الحصة عادية." : "تنعلّم كملغاة (ما تنحسب إيجار ملعب ولا غياب).", danger: !s.cancelled, confirmText: s.cancelled ? "رجّعها" : "إلغاء الحصة" }))) return;
    const { error } = await supabase.from("sessions").update({ cancelled: !s.cancelled }).eq("id", s.id);
    if (error) flash("تعذر الحفظ");
  }

  const dayName = DAY_SHORT[parseISO(date).getDay()];

  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 max-w-5xl">
      {/* header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="display text-navy text-[26px] sm:text-[36px] leading-none">الحضور</h1>
          <p className="text-ink-2 text-sm mt-1.5">اضغط على اسم اللاعب: مرة = حاضر، مرتين = غائب، ثلاث = إلغاء.</p>
        </div>
        {me.canManage && (
          <Link href="/players" className="btn-outline h-10 px-3 text-sm">
            <Users size={16} /> <span className="hidden sm:inline">سجل اللاعبين</span>
          </Link>
        )}
      </div>

      {/* date + filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="card flex items-center p-1">
          <button onClick={() => setDate(format(addDays(parseISO(date), -1), "yyyy-MM-dd"))} className="h-11 w-11 grid place-items-center rounded-lg hover:bg-navy-50 text-navy" aria-label="اليوم السابق">
            <ChevronRight size={18} />
          </button>
          <label className="px-2 h-11 flex items-center gap-2 font-extrabold text-navy cursor-pointer">
            <span>{date === today ? "اليوم" : dayName}</span>
            <input type="date" dir="ltr" className="num bg-transparent outline-none text-[15px]" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <button onClick={() => setDate(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))} className="h-11 w-11 grid place-items-center rounded-lg hover:bg-navy-50 text-navy" aria-label="اليوم التالي">
            <ChevronLeft size={18} />
          </button>
        </div>
        {branches.length > 1 && (
          <select className="field w-auto h-11" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-1.5">
          <button onClick={() => setGroupId(null)} className={clsx("chip px-3 h-9 text-[13px]", !groupId ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
            الكل
          </button>
          {groups
            .filter((g) => g.branch_id === branchId)
            .map((g) => (
              <button key={g.id} onClick={() => setGroupId(groupId === g.id ? null : g.id)} className={clsx("chip px-3 h-9 text-[13px]", groupId === g.id ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
                {g.name}
              </button>
            ))}
        </div>
      </div>

      {!trainingDay && !session && (
        <div className="rounded-xl bg-gold-100 text-navy-900 px-3.5 py-2.5 text-sm font-bold mb-3 flex items-center gap-2">
          <AlertTriangle size={16} /> {dayName} مو يوم تدريب لهذا الفرع — تقدر تحضّر على أي حال.
        </div>
      )}
      {session?.cancelled && (
        <div className="rounded-xl bg-error-100 text-error px-3.5 py-2.5 text-sm font-bold mb-3 flex items-center gap-2">
          <CalendarX size={16} /> هذي الحصة ملغاة.
        </div>
      )}

      {/* summary */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
        <Stat n={counts.present} label="حاضر" cls="text-ice-600" />
        <Stat n={counts.absent} label="غائب" cls="text-error" />
        <Stat n={counts.unmarked} label="بدون علامة" cls="text-ink-2" />
        {counts.trials > 0 && <Stat n={counts.trials} label="تجارب" cls="text-gold" />}
        <div className="ms-auto flex gap-2">
          {counts.unmarked > 0 && (
            <button onClick={markAllPresent} className="btn-outline h-9 px-3 text-sm">
              <Check size={15} /> الكل حاضر
            </button>
          )}
          <button onClick={() => setTrialOpen(true)} className="btn-accent h-9 px-3 text-sm">
            <UserPlus size={15} /> تجربة
          </button>
        </div>
      </div>

      {/* roster */}
      {roster.length === 0 ? (
        <div className="card p-8 text-center text-ink-2">لا يوجد لاعبون في هذا الفرع/الفئة بعد.</div>
      ) : (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map((r) => {
            const st = r.a?.status;
            const trial = r.p.kind === "trial";
            const group = groups.find((g) => g.id === r.p.group_id);
            return (
              <div
                key={r.p.id}
                className={clsx(
                  "relative rounded-2xl border-2 px-3 py-2.5 flex items-center gap-3 transition select-none",
                  st === "present" || st === "late" ? "border-ice bg-ice-50" : st === "absent" || st === "excused" ? "border-error/40 bg-error-100/60" : trial ? "border-gold/60 bg-gold-100/50" : "border-silver-200 bg-white",
                )}
              >
                <button onClick={() => cycle(r)} className="flex-1 min-w-0 text-start flex items-center gap-3 min-h-11" aria-label={`${r.p.full_name}: ${st === "present" ? "حاضر" : st === "absent" ? "غائب" : "بدون علامة"}`}>
                  <span
                    className={clsx(
                      "h-9 w-9 shrink-0 rounded-full grid place-items-center font-extrabold transition",
                      st === "present" || st === "late" ? "bg-ice text-navy-900" : st === "absent" || st === "excused" ? "bg-error text-white" : trial ? "bg-gold text-navy-900" : "bg-navy-50 text-navy",
                    )}
                  >
                    {st === "present" ? <Check size={18} /> : st === "late" ? <Clock size={16} /> : st === "absent" || st === "excused" ? <X size={18} /> : trial ? <FlaskConical size={16} /> : r.p.full_name.trim()[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-extrabold text-navy text-[16px] leading-tight truncate">{r.p.full_name}</span>
                    <span className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {trial && <span className="chip bg-gold text-navy-900 px-1.5 text-[10px]">تجربة</span>}
                      {group && <span className="text-ink-2 text-[11px]">{group.name}</span>}
                      {r.p.age && <span className="num text-ink-2 text-[11px]">{r.p.age} سنوات</span>}
                      {me.canManage && r.st.state === "expired" && <span className="chip bg-error text-white px-1.5 text-[10px]">انتهى الاشتراك</span>}
                      {me.canManage && r.st.state === "expiring" && <span className="chip bg-gold-100 text-navy-900 px-1.5 text-[10px]">ينتهي خلال {r.st.daysLeft} يوم</span>}
                    </span>
                  </span>
                </button>
                {/* explicit late / excused (small) */}
                <div className="flex flex-col gap-1">
                  <button onClick={() => mark(r.p.id, st === "late" ? "present" : "late")} className={clsx("h-8 w-8 rounded-lg grid place-items-center border text-[11px] font-bold", st === "late" ? "bg-navy text-white border-navy" : "bg-white/70 text-ink-2 border-silver-200")} title="متأخر" aria-label="متأخر">
                    <Clock size={13} />
                  </button>
                  <button onClick={() => mark(r.p.id, st === "excused" ? "absent" : "excused")} className={clsx("h-8 w-8 rounded-lg grid place-items-center border text-[11px] font-bold", st === "excused" ? "bg-navy text-white border-navy" : "bg-white/70 text-ink-2 border-silver-200")} title="غياب بعذر" aria-label="غياب بعذر">
                    ع
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 text-ink-2 text-xs">
        <span>
          {session ? (
            <>
              حصة {format(parseISO(session.session_date), "EEEE d MMMM", { locale: ar })} · <span className="num">{roster.filter((r) => r.a).length}</span> معلّم
            </>
          ) : (
            "ما تم فتح الحصة بعد — تنفتح تلقائياً مع أول علامة"
          )}
        </span>
        {me.canManage && (
          <button onClick={cancelSession} className="btn-ghost h-8 px-2 text-xs">
            <CalendarX size={14} /> {session?.cancelled ? "إرجاع الحصة" : "إلغاء الحصة"}
          </button>
        )}
      </div>

      {toast && <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] md:bottom-6 inset-x-4 md:inset-x-auto md:end-6 z-[60] rounded-xl bg-error text-white px-4 py-2.5 text-sm font-bold shadow-[var(--shadow-pop)] fade-up text-center">{toast}</div>}

      <Modal
        open={trialOpen}
        onClose={() => setTrialOpen(false)}
        title="لاعب تجربة جديد"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setTrialOpen(false)}>
              إلغاء
            </button>
            <button form="trial-form" className="btn-primary" disabled={busy}>
              <Sparkles size={16} /> إضافة وتحضير
            </button>
          </>
        }
      >
        <form id="trial-form" onSubmit={addTrial} className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="اسم اللاعب">
            <input className="field" value={trialName} onChange={(e) => setTrialName(e.target.value)} required placeholder="الاسم الثلاثي" />
          </Field>
          <Field label="العمر">
            <input className="field num" dir="ltr" type="number" inputMode="numeric" min={3} max={14} value={trialAge} onChange={(e) => setTrialAge(e.target.value)} />
          </Field>
          <p className="sm:col-span-2 text-ink-2 text-xs">يظهر باللون الذهبي في قائمة الحضور. باقي بياناته (ولي الأمر، المصدر) تكمّلها الإدارة من سجل اللاعبين.</p>
        </form>
      </Modal>
    </div>
  );
}

function Stat({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={clsx("num text-[22px] font-bold leading-none", cls)}>{n}</span>
      <span className="text-ink-2 text-xs font-bold">{label}</span>
    </span>
  );
}
