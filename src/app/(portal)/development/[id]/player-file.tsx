"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Plus, ClipboardList, Timer, Target, StickyNote, Pencil, Trash2, Check, X, ChevronDown, TrendingUp, TrendingDown, Trophy } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/confirm";
import { Avatar, EmptyState, Field, Modal } from "@/components/ui";
import { ScoreBar, TrendChart } from "@/components/development/charts";
import { PILLARS, SCORE_LABELS, TESTS, fmt1, overall, pillarAvg, pillarOf, testOf, type Evaluation, type Goal, type Pillar, type PlayerNote, type PlayerTest, type Scores } from "@/lib/development";
import type { PlayerStats } from "@/lib/players";
import type { StaffName } from "@/lib/types";

type PlayerHead = { id: string; full_name: string; age: number | null; group_name: string | null; kind: "subscriber" | "trial"; trial_date: string | null; created_at: string };
type Tab = "evals" | "tests" | "goals" | "notes";

const dLong = (d: string) => format(parseISO(d), "d MMMM yyyy", { locale: ar });
const dShort = (d: string) => format(parseISO(d), "d/M/yyyy");

export default function PlayerFile({
  me,
  today,
  player,
  initialEvals,
  initialTests,
  initialGoals,
  initialNotes,
  staff,
  stats,
}: {
  me: { id: string; isOwner: boolean };
  today: string;
  player: PlayerHead;
  initialEvals: Evaluation[];
  initialTests: PlayerTest[];
  initialGoals: Goal[];
  initialNotes: PlayerNote[];
  staff: StaffName[];
  stats: PlayerStats | null;
}) {
  const [evals, setEvals] = useState(initialEvals); // oldest → newest
  const [tests, setTests] = useState(initialTests);
  const [goals, setGoals] = useState(initialGoals);
  const [notes, setNotes] = useState(initialNotes);
  const [tab, setTab] = useState<Tab>("evals");
  const [editing, setEditing] = useState<Evaluation | "new" | null>(null);
  const [series, setSeries] = useState<"overall" | Pillar>("overall");
  const [openPillar, setOpenPillar] = useState<Pillar | null>(null);

  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.full_name ?? "—";
  const canEdit = (createdBy: string | null) => me.isOwner || createdBy === me.id;

  const latest = evals[evals.length - 1] ?? null;
  const previous = evals[evals.length - 2] ?? null;
  const ov = latest ? overall(latest.scores) : null;
  const ovPrev = previous ? overall(previous.scores) : null;
  const total = stats ? stats.present_count + stats.late_count + stats.absent_count : 0;
  const attendPct = total ? Math.round(((stats!.present_count + stats!.late_count) / total) * 100) : null;
  const activeGoals = goals.filter((g) => g.status === "active");

  const trend = useMemo(
    () =>
      evals
        .map((e) => ({ date: e.eval_date, value: series === "overall" ? overall(e.scores) : pillarAvg(e.scores, series) }))
        .filter((p): p is { date: string; value: number } => p.value !== null),
    [evals, series],
  );

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl flex flex-col gap-5">
      <Link href="/development" className="text-ink-2 text-[14px] font-bold flex items-center gap-1 w-fit hover:text-navy">
        <ArrowRight size={16} /> كل اللاعبين
      </Link>

      {/* header */}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={player.full_name} size={60} />
        <div className="min-w-0 flex-1">
          <h1 className="text-navy text-[24px] sm:text-[28px] font-extrabold leading-tight">{player.full_name}</h1>
          <div className="text-ink-2 text-[14px] flex flex-wrap items-center gap-x-2">
            <span>{player.group_name ?? "بدون فئة"}</span>
            {player.age ? <span className="num">· {player.age} سنوات</span> : null}
            {player.kind === "trial" && <span className="chip bg-ice-50 text-ice-600 text-[11.5px]">لاعب تجربة</span>}
          </div>
        </div>
        <button className="btn-primary h-11" onClick={() => setEditing("new")}>
          <Plus size={18} /> تقييم جديد
        </button>
      </div>

      {/* stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="التقييم العام" value={fmt1(ov)} suffix="/ 5" delta={ov !== null && ovPrev !== null ? ov - ovPrev : null} />
        <Tile label="نسبة الحضور" value={attendPct === null ? "—" : `${attendPct}%`} sub={total ? `${(stats?.present_count ?? 0) + (stats?.late_count ?? 0)} من ${total} حصة` : "ما فيه حضور مسجل"} />
        <Tile label="أهداف نشطة" value={String(activeGoals.length)} sub={`${goals.filter((g) => g.status === "achieved").length} تحققت`} />
        <Tile label="آخر تقييم" value={latest ? dShort(latest.eval_date) : "—"} sub={latest ? `بواسطة ${nameOf(latest.created_by)}` : "ما فيه تقييم بعد"} small />
      </div>

      {latest ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr] items-start">
          {/* current profile */}
          <div className="card p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="font-extrabold text-navy text-[16px]">الملف الحالي</div>
              {previous && (
                <span className="text-ink-2 text-[11.5px] flex items-center gap-1.5">
                  <span className="inline-block w-[2px] h-3 bg-navy/60 rounded" /> التقييم السابق
                </span>
              )}
            </div>
            {PILLARS.map((p) => {
              const open = openPillar === p.key;
              return (
                <div key={p.key} className="flex flex-col gap-2">
                  <button type="button" onClick={() => setOpenPillar(open ? null : p.key)} className="text-start flex items-center gap-1" aria-expanded={open}>
                    <span className="flex-1">
                      <ScoreBar strong label={p.label} value={pillarAvg(latest.scores, p.key)} prev={previous ? pillarAvg(previous.scores, p.key) : null} color={p.color} />
                    </span>
                    <ChevronDown size={16} className={clsx("text-ink-2 transition shrink-0", open && "rotate-180")} />
                  </button>
                  {open && (
                    <div className="flex flex-col gap-1.5 ps-3 border-s-2 ms-1 fade-up" style={{ borderColor: p.color }}>
                      {p.skills.map((s) => (
                        <ScoreBar key={s.key} label={s.label} value={latest.scores[s.key] ?? null} prev={previous?.scores[s.key] ?? null} color={p.color} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-ink-2 text-[11.5px]">اضغط على أي محور لعرض مهاراته بالتفصيل.</p>
          </div>

          {/* trend */}
          <div className="card p-4 sm:p-5 flex flex-col gap-3">
            <div className="font-extrabold text-navy text-[16px]">التطوّر عبر الوقت</div>
            <div className="flex flex-wrap gap-1.5">
              {[{ key: "overall" as const, label: "العام" }, ...PILLARS.map((p) => ({ key: p.key, label: p.label }))].map((s) => (
                <button key={s.key} onClick={() => setSeries(s.key)} className={clsx("chip h-8 px-3 text-[12.5px]", series === s.key ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
                  {s.label}
                </button>
              ))}
            </div>
            {trend.length > 1 ? (
              <TrendChart points={trend} label={`تطوّر ${series === "overall" ? "التقييم العام" : pillarOf(series).label}`} />
            ) : (
              <div className="text-ink-2 text-[13px] rounded-lg bg-silver-100/70 px-3 py-6 text-center">الرسم يظهر بعد تقييمين أو أكثر</div>
            )}
          </div>
        </div>
      ) : (
        <div className="card p-6 text-center flex flex-col items-center gap-3">
          <ClipboardList size={30} className="text-ice" />
          <div className="font-extrabold text-navy text-[17px]">ابدأ ملف {player.full_name.split(" ")[0]}</div>
          <p className="text-ink-2 text-[14px] max-w-md">أول تقييم يصير نقطة البداية، وكل تقييم بعده يبيّن وين تطوّر اللاعب ووين يحتاج شغل.</p>
          <button className="btn-primary" onClick={() => setEditing("new")}>
            <Plus size={17} /> أول تقييم
          </button>
        </div>
      )}

      {/* tabs */}
      <div className="flex gap-1.5 p-1 rounded-2xl bg-silver-100 w-fit max-w-full overflow-x-auto">
        {(
          [
            ["evals", `التقييمات (${evals.length})`, <ClipboardList key="e" size={16} />],
            ["tests", "الاختبارات", <Timer key="t" size={16} />],
            ["goals", `الأهداف (${activeGoals.length})`, <Target key="g" size={16} />],
            ["notes", `الملاحظات (${notes.length})`, <StickyNote key="n" size={16} />],
          ] as const
        ).map(([k, label, icon]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx("h-10 px-3.5 rounded-xl text-[14px] font-bold flex items-center gap-2 whitespace-nowrap transition", tab === k ? "bg-white text-navy shadow-sm" : "text-ink-2 hover:text-navy")}>
            {icon}
            {label}
          </button>
        ))}
      </div>

      {tab === "evals" && <EvalHistory evals={evals} nameOf={nameOf} canEdit={canEdit} onEdit={setEditing} onDeleted={(id) => setEvals((e) => e.filter((x) => x.id !== id))} />}
      {tab === "tests" && <Tests playerId={player.id} today={today} tests={tests} setTests={setTests} canEdit={canEdit} />}
      {tab === "goals" && <Goals playerId={player.id} today={today} goals={goals} setGoals={setGoals} canEdit={canEdit} />}
      {tab === "notes" && <Notes playerId={player.id} notes={notes} setNotes={setNotes} nameOf={nameOf} canEdit={canEdit} />}

      {editing && (
        <EvalModal
          playerId={player.id}
          today={today}
          editing={editing === "new" ? null : editing}
          seed={editing === "new" ? (latest?.scores ?? {}) : editing.scores}
          onClose={() => setEditing(null)}
          onSaved={(e) => {
            setEvals((list) => [...list.filter((x) => x.id !== e.id), e].sort((a, b) => a.eval_date.localeCompare(b.eval_date) || a.created_at.localeCompare(b.created_at)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Tile({ label, value, suffix, sub, delta, small }: { label: string; value: string; suffix?: string; sub?: string; delta?: number | null; small?: boolean }) {
  return (
    <div className="card p-3.5 sm:p-4 flex flex-col gap-1">
      <span className="text-ink-2 text-[12.5px] font-bold">{label}</span>
      <span className="flex items-end gap-1.5">
        <span className={clsx("num text-navy font-extrabold leading-none", small ? "text-[20px]" : "text-[28px]")}>{value}</span>
        {suffix && <span className="text-ink-2 text-[12px] pb-0.5">{suffix}</span>}
        {delta != null && Math.abs(delta) >= 0.05 && (
          <span className={clsx("num text-[12px] font-bold flex items-center gap-0.5 pb-0.5", delta > 0 ? "text-[#1a8f5f]" : "text-error")}>
            {delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}
          </span>
        )}
      </span>
      {sub && <span className="text-ink-2 text-[12px] truncate">{sub}</span>}
    </div>
  );
}

/* ---------------- evaluation modal ---------------- */

function EvalModal({ playerId, today, editing, seed, onClose, onSaved }: { playerId: string; today: string; editing: Evaluation | null; seed: Scores; onClose: () => void; onSaved: (e: Evaluation) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(editing?.eval_date ?? today);
  const [scores, setScores] = useState<Scores>({ ...seed });
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const filled = Object.values(scores).filter((v) => v > 0).length;

  function set(key: string, v: number) {
    setScores((s) => {
      const next = { ...s };
      if (next[key] === v) delete next[key];
      else next[key] = v;
      return next;
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!filled) return setErr("قيّم مهارة وحدة على الأقل");
    setBusy(true);
    const payload = { player_id: playerId, eval_date: date, scores, notes: notes.trim() };
    const res = editing
      ? await supabase.from("player_evaluations").update(payload).eq("id", editing.id).select("*").single()
      : await supabase.from("player_evaluations").insert(payload).select("*").single();
    setBusy(false);
    if (res.error || !res.data) return setErr("تعذر الحفظ — تحقق من الاتصال");
    onSaved(res.data as Evaluation);
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={editing ? "تعديل التقييم" : "تقييم جديد"}
      footer={
        <div className="flex items-center gap-3 w-full">
          <span className="text-ink-2 text-[13px] num">{filled} مهارة مقيّمة</span>
          {err && <span className="text-error text-[13px] font-bold">{err}</span>}
          <button type="submit" form="eval-form" className="btn-primary ms-auto" disabled={busy}>
            <Check size={17} /> {busy ? "جارٍ الحفظ…" : "حفظ التقييم"}
          </button>
        </div>
      }
    >
      <form id="eval-form" onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="تاريخ التقييم">
            <input type="date" dir="ltr" className="field num w-[180px]" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} required />
          </Field>
          {!editing && Object.keys(seed).length > 0 && <p className="text-ink-2 text-[12.5px] pb-2">معبّأ من آخر تقييم — عدّل اللي تغيّر بس.</p>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
          {SCORE_LABELS.slice(1).map((l, i) => (
            <span key={l}>
              <b className="num text-navy">{i + 1}</b> {l}
            </span>
          ))}
        </div>
        {PILLARS.map((p) => (
          <fieldset key={p.key} className="rounded-xl border border-silver-200 p-3 flex flex-col gap-2">
            <legend className="px-1.5 font-extrabold text-navy text-[14px] flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} /> {p.label}
            </legend>
            {p.skills.map((s) => (
              <div key={s.key} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <span className="text-[13.5px] font-bold text-navy w-full sm:w-40 shrink-0">{s.label}</span>
                <div className="flex gap-1.5 flex-1" role="radiogroup" aria-label={s.label}>
                  {[1, 2, 3, 4, 5].map((v) => {
                    const on = scores[s.key] === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        title={SCORE_LABELS[v]}
                        onClick={() => set(s.key, v)}
                        className={clsx("num h-10 flex-1 sm:flex-none sm:w-11 rounded-lg text-[15px] font-bold border transition", on ? "text-white border-transparent" : "bg-white border-silver-200 text-navy hover:border-ice")}
                        style={on ? { background: p.color } : undefined}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>
        ))}
        <Field label="ملاحظات المدرب">
          <textarea className="field min-h-[84px] py-2 leading-relaxed" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="نقاط القوة، اللي يحتاج تطوير، وأي شي لاحظته" />
        </Field>
      </form>
    </Modal>
  );
}

/* ---------------- history ---------------- */

function EvalHistory({ evals, nameOf, canEdit, onEdit, onDeleted }: { evals: Evaluation[]; nameOf: (id: string | null) => string; canEdit: (by: string | null) => boolean; onEdit: (e: Evaluation) => void; onDeleted: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const [open, setOpen] = useState<string | null>(null);
  if (!evals.length) return <EmptyState title="ما فيه تقييمات بعد" />;
  const list = [...evals].reverse();

  async function remove(e: Evaluation) {
    if (!(await confirm({ title: "حذف هذا التقييم؟", message: dLong(e.eval_date), confirmText: "حذف" }))) return;
    const { error } = await supabase.from("player_evaluations").delete().eq("id", e.id);
    if (!error) onDeleted(e.id);
  }

  return (
    <div className="card divide-y divide-silver-200 overflow-hidden">
      {list.map((e, i) => {
        const prev = list[i + 1];
        const o = overall(e.scores);
        const d = prev && o !== null ? (overall(prev.scores) !== null ? o - overall(prev.scores)! : null) : null;
        const isOpen = open === e.id;
        return (
          <div key={e.id}>
            <div className="p-3.5 sm:px-4 flex items-center gap-3">
              <button className="flex-1 min-w-0 text-start flex items-center gap-3" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                <span className="num text-navy font-extrabold text-[20px] w-12">{fmt1(o)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-navy text-[14px]">{dLong(e.eval_date)}</span>
                  <span className="block text-ink-2 text-[12.5px] truncate">
                    {nameOf(e.created_by)}
                    {e.notes ? ` · ${e.notes}` : ""}
                  </span>
                </span>
                {d !== null && Math.abs(d) >= 0.05 && <span className={clsx("num text-[12.5px] font-bold", d > 0 ? "text-[#1a8f5f]" : "text-error")}>{d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1)}</span>}
                <ChevronDown size={16} className={clsx("text-ink-2 transition", isOpen && "rotate-180")} />
              </button>
              {canEdit(e.created_by) && (
                <div className="flex shrink-0">
                  <button onClick={() => onEdit(e)} className="h-9 w-9 grid place-items-center rounded-lg text-ink-2 hover:bg-navy-50 hover:text-navy" aria-label="تعديل">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => remove(e)} className="h-9 w-9 grid place-items-center rounded-lg text-ink-2 hover:bg-error-100 hover:text-error" aria-label="حذف">
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
            {isOpen && (
              <div className="px-4 pb-4 grid gap-4 sm:grid-cols-2 fade-up">
                {PILLARS.map((p) => (
                  <div key={p.key} className="flex flex-col gap-1.5">
                    <ScoreBar strong label={p.label} value={pillarAvg(e.scores, p.key)} color={p.color} />
                    {p.skills.map((s) => (
                      <ScoreBar key={s.key} label={s.label} value={e.scores[s.key] ?? null} color={p.color} />
                    ))}
                  </div>
                ))}
                {e.notes && <p className="sm:col-span-2 text-[14px] text-navy bg-silver-100/70 rounded-lg px-3 py-2 whitespace-pre-line">{e.notes}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- tests ---------------- */

function Tests({ playerId, today, tests, setTests, canEdit }: { playerId: string; today: string; tests: PlayerTest[]; setTests: React.Dispatch<React.SetStateAction<PlayerTest[]>>; canEdit: (by: string | null) => boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [key, setKey] = useState(TESTS[0].key);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || value === "") return;
    setBusy(true);
    const { data } = await supabase.from("player_tests").insert({ player_id: playerId, test_key: key, value: n, test_date: date }).select("*").single();
    setBusy(false);
    if (data) {
      setTests((t) => [...t, data as PlayerTest].sort((a, b) => a.test_date.localeCompare(b.test_date)));
      setValue("");
      setOpenKey(key);
    }
  }
  async function remove(t: PlayerTest) {
    const { error } = await supabase.from("player_tests").delete().eq("id", t.id);
    if (!error) setTests((x) => x.filter((y) => y.id !== t.id));
  }

  const t = testOf(key)!;
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
      <form onSubmit={add} className="card p-4 flex flex-col gap-3">
        <div className="font-extrabold text-navy text-[15px]">تسجيل نتيجة</div>
        <Field label="الاختبار">
          <select className="field" value={key} onChange={(e) => setKey(e.target.value)}>
            {TESTS.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-ink-2 text-[12px] -mt-1.5">{t.hint}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`النتيجة (${t.unit})`}>
            <input className="field num" dir="ltr" type="number" step="any" min={0} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required />
          </Field>
          <Field label="التاريخ">
            <input className="field num" dir="ltr" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} required />
          </Field>
        </div>
        <button className="btn-primary" disabled={busy}>
          <Plus size={17} /> حفظ النتيجة
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        {TESTS.map((x) => {
          const rows = tests.filter((r) => r.test_key === x.key);
          if (!rows.length) return null;
          const last = rows[rows.length - 1];
          const first = rows[0];
          const best = rows.reduce((b, r) => (x.lowerIsBetter ? (r.value < b.value ? r : b) : r.value > b.value ? r : b), rows[0]);
          const improved = rows.length > 1 ? (x.lowerIsBetter ? first.value - last.value : last.value - first.value) : null;
          const open = openKey === x.key;
          return (
            <div key={x.key} className="card p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-navy text-[14px] flex-1">{x.label}</span>
                {best.id === last.id && rows.length > 1 && (
                  <span className="chip bg-gold/20 text-[#8a6a00] text-[11px] gap-1">
                    <Trophy size={12} /> أفضل رقم
                  </span>
                )}
              </div>
              <div className="flex items-end gap-2">
                <span className="num text-navy text-[28px] font-extrabold leading-none">{last.value}</span>
                <span className="text-ink-2 text-[13px] pb-0.5">{x.unit}</span>
                {improved !== null && Math.abs(improved) > 0 && (
                  <span className={clsx("num text-[12px] font-bold pb-1 ms-auto", improved > 0 ? "text-[#1a8f5f]" : "text-error")}>
                    {improved > 0 ? "تحسّن" : "تراجع"} {Math.abs(improved).toFixed(x.unit === "ث" ? 2 : 0)} {x.unit} منذ البداية
                  </span>
                )}
              </div>
              {rows.length > 1 && <TrendChart points={rows.map((r) => ({ date: r.test_date, value: Number(r.value) }))} min={Math.min(...rows.map((r) => Number(r.value)))} max={Math.max(...rows.map((r) => Number(r.value)))} unit={x.unit} invert={x.lowerIsBetter} height={110} label={x.label} />}
              <button className="text-ink-2 text-[12px] font-bold flex items-center gap-1 w-fit" onClick={() => setOpenKey(open ? null : x.key)}>
                كل النتائج ({rows.length}) <ChevronDown size={14} className={clsx("transition", open && "rotate-180")} />
              </button>
              {open && (
                <ul className="flex flex-col gap-1 text-[13px]">
                  {[...rows].reverse().map((r) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <span className="num text-ink-2 w-24" dir="ltr">
                        {dShort(r.test_date)}
                      </span>
                      <span className="num font-bold text-navy">
                        {r.value} {x.unit}
                      </span>
                      {canEdit(r.created_by) && (
                        <button onClick={() => remove(r)} className="ms-auto h-7 w-7 grid place-items-center rounded text-ink-2 hover:text-error" aria-label="حذف">
                          <X size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {tests.length === 0 && (
          <div className="sm:col-span-2">
            <EmptyState title="ما فيه نتائج اختبارات" hint="سجّل أول نتيجة من النموذج — كررها كل شهر أو فصل عشان يبين التطوّر." />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- goals ---------------- */

function Goals({ playerId, today, goals, setGoals, canEdit }: { playerId: string; today: string; goals: Goal[]; setGoals: React.Dispatch<React.SetStateAction<Goal[]>>; canEdit: (by: string | null) => boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState("");
  const [pillar, setPillar] = useState<Pillar>("technical");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { data } = await supabase.from("player_goals").insert({ player_id: playerId, title: title.trim(), pillar, target_date: target || null }).select("*").single();
    setBusy(false);
    if (data) {
      setGoals((g) => [...g, data as Goal]);
      setTitle("");
      setTarget("");
    }
  }
  async function setStatus(g: Goal, status: Goal["status"]) {
    const { data } = await supabase.from("player_goals").update({ status, achieved_at: status === "achieved" ? today : null }).eq("id", g.id).select("*").single();
    if (data) setGoals((list) => list.map((x) => (x.id === g.id ? (data as Goal) : x)));
  }
  async function remove(g: Goal) {
    const { error } = await supabase.from("player_goals").delete().eq("id", g.id);
    if (!error) setGoals((list) => list.filter((x) => x.id !== g.id));
  }

  const order = { active: 0, achieved: 1, dropped: 2 };
  const sorted = [...goals].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
      <form onSubmit={add} className="card p-4 flex flex-col gap-3">
        <div className="font-extrabold text-navy text-[15px]">هدف جديد</div>
        <p className="text-ink-2 text-[12px] -mt-2">خطة التطوير الفردية: هدفين أو ثلاثة واضحة لكل لاعب.</p>
        <Field label="الهدف">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: يستخدم القدم اليسرى في التمرير" required />
        </Field>
        <Field label="المحور" group>
          <div className="flex flex-wrap gap-1.5">
            {PILLARS.map((p) => (
              <button key={p.key} type="button" onClick={() => setPillar(p.key)} className={clsx("chip h-8 px-3 text-[12.5px] gap-1.5", pillar === p.key ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy")}>
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                {p.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="الموعد المستهدف (اختياري)">
          <input className="field num" dir="ltr" type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <button className="btn-primary" disabled={busy}>
          <Plus size={17} /> إضافة الهدف
        </button>
      </form>

      {sorted.length === 0 ? (
        <EmptyState title="ما فيه أهداف بعد" />
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((g) => {
            const p = pillarOf(g.pillar);
            return (
              <div key={g.id} className={clsx("card p-3.5 flex items-start gap-3", g.status !== "active" && "opacity-70")}>
                <button
                  onClick={() => setStatus(g, g.status === "achieved" ? "active" : "achieved")}
                  className={clsx("h-7 w-7 shrink-0 rounded-full border-2 grid place-items-center mt-0.5 transition", g.status === "achieved" ? "bg-[#1a8f5f] border-[#1a8f5f] text-white" : "border-silver-200 hover:border-[#1a8f5f]")}
                  aria-label={g.status === "achieved" ? "إرجاع كهدف نشط" : "تحقق الهدف"}
                  title={g.status === "achieved" ? "إرجاع كهدف نشط" : "تحقق الهدف"}
                >
                  {g.status === "achieved" && <Check size={15} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={clsx("font-bold text-navy text-[14.5px]", g.status === "dropped" && "line-through")}>{g.title}</div>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[12px] text-ink-2">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      {p.label}
                    </span>
                    {g.status === "achieved" && g.achieved_at && <span className="text-[#1a8f5f] font-bold">تحقق {dShort(g.achieved_at)}</span>}
                    {g.status === "active" && g.target_date && <span className={clsx(g.target_date < today && "text-error font-bold")}>الموعد {dShort(g.target_date)}</span>}
                    {g.status === "dropped" && <span>أُلغي</span>}
                  </div>
                </div>
                <div className="flex shrink-0">
                  {g.status === "active" && (
                    <button onClick={() => setStatus(g, "dropped")} className="h-8 px-2 rounded-lg text-ink-2 text-[12px] font-bold hover:bg-silver-100">
                      إلغاء
                    </button>
                  )}
                  {g.status === "dropped" && (
                    <button onClick={() => setStatus(g, "active")} className="h-8 px-2 rounded-lg text-ink-2 text-[12px] font-bold hover:bg-silver-100">
                      إرجاع
                    </button>
                  )}
                  {canEdit(g.created_by) && (
                    <button onClick={() => remove(g)} className="h-8 w-8 grid place-items-center rounded-lg text-ink-2 hover:bg-error-100 hover:text-error" aria-label="حذف">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- notes ---------------- */

function Notes({ playerId, notes, setNotes, nameOf, canEdit }: { playerId: string; notes: PlayerNote[]; setNotes: React.Dispatch<React.SetStateAction<PlayerNote[]>>; nameOf: (id: string | null) => string; canEdit: (by: string | null) => boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const { data } = await supabase.from("player_notes").insert({ player_id: playerId, body: body.trim() }).select("*").single();
    setBusy(false);
    if (data) {
      setNotes((n) => [data as PlayerNote, ...n]);
      setBody("");
    }
  }
  async function remove(n: PlayerNote) {
    const { error } = await supabase.from("player_notes").delete().eq("id", n.id);
    if (!error) setNotes((list) => list.filter((x) => x.id !== n.id));
  }

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <form onSubmit={add} className="card p-3 flex flex-col gap-2">
        <textarea className="field min-h-[76px] py-2 leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} placeholder="ملاحظة سريعة بعد الحصة — شي لاحظته على اللاعب" />
        <button className="btn-primary w-fit ms-auto h-10" disabled={busy || !body.trim()}>
          <Plus size={16} /> إضافة ملاحظة
        </button>
      </form>
      {notes.length === 0 ? (
        <EmptyState title="ما فيه ملاحظات" />
      ) : (
        notes.map((n) => (
          <div key={n.id} className="card p-3.5 flex items-start gap-3">
            <Avatar name={nameOf(n.created_by)} size={32} tone="light" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[12.5px]">
                <span className="font-bold text-navy">{nameOf(n.created_by)}</span>
                <span className="text-ink-2">{format(new Date(n.created_at), "d MMMM yyyy · h:mm a", { locale: ar })}</span>
              </div>
              <p className="text-navy text-[14px] mt-1 whitespace-pre-line">{n.body}</p>
            </div>
            {canEdit(n.created_by) && (
              <button onClick={() => remove(n)} className="h-8 w-8 grid place-items-center rounded-lg text-ink-2 hover:bg-error-100 hover:text-error shrink-0" aria-label="حذف">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
