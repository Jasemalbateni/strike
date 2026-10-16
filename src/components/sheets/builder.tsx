"use client";

/* ورقة التمرين — editor (right) + live A4 preview (left), exported to PDF via the browser's print.
 * Visuals are a 1:1 port of the STRIKE drill-sheet HTML; this adds: coach from the logged-in profile,
 * saving to Supabase, and "حصة كاملة" mode (several drills → cover page + one page per drill). */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ArrowDown, ArrowRight, ArrowUp, Plus, Printer, Save, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/confirm";
import { fmtDate, KIND_LABEL, lines, newDrill, SHEET_AGES, SHEET_CATEGORIES, SHEET_INTENSITY, totalMinutes, type DrillSheet, type SheetDrill, type SheetKind } from "@/lib/sheets";
import "./sheet.css";

export type SheetMe = { id: string; name: string; canDelete: boolean };

type Props = {
  sheet: DrillSheet | null;
  me: SheetMe;
  authorName?: string;
  today: string;
  /** opened with ?kind=session */
  initialKind?: SheetKind;
};

const DIAGRAM_MAX = 1600;
const BUCKET = "drill-sheets";

export default function SheetBuilder({ sheet, me, authorName, today, initialKind }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const supabase = useMemo(() => createClient(), []);

  const [id, setId] = useState<string | null>(sheet?.id ?? null);
  const [kind, setKind] = useState<SheetKind>(sheet?.kind ?? initialKind ?? "drill");
  const [title, setTitle] = useState(sheet?.title ?? "");
  const [date, setDate] = useState(sheet?.session_date ?? today);
  const [ageGroup, setAgeGroup] = useState(sheet?.age_group ?? SHEET_AGES[0]);
  const [drills, setDrills] = useState<SheetDrill[]>(sheet?.drills?.length ? sheet.drills : [newDrill()]);
  const [active, setActive] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone?: "ok" | "err" } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const coach = authorName || me.name;
  const readOnly = !!sheet && sheet.author_id !== me.id && !me.canDelete;

  const cur = drills[Math.min(active, drills.length - 1)];

  function flash(text: string, tone: "ok" | "err" = "ok") {
    setToast({ text, tone });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 2600);
  }

  /* ---------- scale the A4 page to narrow screens ---------- */
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const mm = 96 / 25.4;
    const update = () => setScale(Math.min(1, el.clientWidth / (210 * mm)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  /* ---------- drill editing ---------- */
  function patch(p: Partial<SheetDrill>) {
    setDrills((a) => a.map((d, i) => (i === active ? { ...d, ...p } : d)));
    setDirty(true);
  }
  function field<K extends keyof SheetDrill>(k: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => patch({ [k]: e.target.value } as Partial<SheetDrill>);
  }
  function addDrill() {
    setDrills((a) => {
      const d = newDrill();
      d.age = ageGroup;
      return [...a, d];
    });
    setActive(drills.length);
    setDirty(true);
  }
  async function removeDrill(i: number) {
    if (drills.length <= 1) return;
    const d = drills[i];
    if ((d.title || d.img || d.desc) && !(await confirm({ title: "حذف هذا التمرين من الحصة؟", message: d.title || "تمرين بدون اسم", confirmText: "حذف", danger: true }))) return;
    setDrills((a) => a.filter((_, j) => j !== i));
    setActive((x) => Math.max(0, Math.min(x > i ? x - 1 : x, drills.length - 2)));
    setDirty(true);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= drills.length) return;
    setDrills((a) => {
      const b = [...a];
      [b[i], b[j]] = [b[j], b[i]];
      return b;
    });
    setActive(j);
    setDirty(true);
  }
  function switchKind(k: SheetKind) {
    if (k === kind) return;
    if (k === "drill" && drills.length > 1) {
      confirm({ title: "التحويل إلى تمرين واحد", message: "يُحتفظ بالتمرين الأول فقط، وتُحذف بقية تمارين الحصة من هذه الورقة.", confirmText: "تحويل", danger: true }).then((ok) => {
        if (!ok) return;
        setDrills((a) => [a[0]]);
        setActive(0);
        setKind("drill");
        setDirty(true);
      });
      return;
    }
    setKind(k);
    setDirty(true);
  }

  /* ---------- diagram upload: shrink on the device, store in Supabase storage ---------- */
  async function setImage(file: File | null | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const blob = await shrink(file);
      const path = `${me.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      patch({ img: data.publicUrl });
    } catch {
      flash("تعذّر رفع الصورة — تحقق من الاتصال", "err");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const it = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (it) setImage(it.getAsFile());
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    setImage(e.dataTransfer.files[0]);
  }

  /* ---------- persistence ---------- */
  async function save(): Promise<boolean> {
    const sheetTitle = (kind === "session" ? title : drills[0].title).trim();
    if (!sheetTitle) {
      flash(kind === "session" ? "اكتب اسم الحصة أولاً" : "اكتب اسم التمرين أولاً", "err");
      return false;
    }
    setSaving(true);
    const payload = {
      kind,
      title: sheetTitle,
      session_date: date || null,
      age_group: kind === "session" ? ageGroup : drills[0].age,
      drills: drills.map((d) => ({ ...d, title: d.title.trim() })),
    };
    const res = id ? await supabase.from("drill_sheets").update(payload).eq("id", id).select("id").single() : await supabase.from("drill_sheets").insert(payload).select("id").single();
    setSaving(false);
    if (res.error || !res.data) {
      flash("تعذّر الحفظ — تحقق من الاتصال", "err");
      return false;
    }
    const wasNew = !id;
    setId(res.data.id);
    setDirty(false);
    if (wasNew) window.history.replaceState(null, "", `/sheets/${res.data.id}`);
    flash("تم الحفظ");
    return true;
  }
  async function remove() {
    if (!id) return;
    if (!(await confirm({ title: "حذف الورقة؟", message: "تُحذف الورقة وكل تمارينها. ما ينفع التراجع.", confirmText: "حذف", danger: true }))) return;
    const { error } = await supabase.from("drill_sheets").delete().eq("id", id);
    if (error) return flash("تعذّر الحذف", "err");
    setDirty(false);
    router.push("/sheets");
  }
  async function reset() {
    if (!(await confirm({ title: "مسح كل البيانات والبدء من جديد؟", confirmText: "مسح", danger: true }))) return;
    setTitle("");
    setDate(today);
    setDrills([newDrill()]);
    setActive(0);
    setDirty(true);
  }
  async function leave() {
    if (dirty && !(await confirm({ title: "تغييرات غير محفوظة", message: "تبي تطلع بدون حفظ؟ بتضيع آخر التعديلات.", confirmText: "خروج بدون حفظ" }))) return;
    setDirty(false);
    router.push("/sheets");
  }
  function exportPdf() {
    const t = kind === "session" ? title : drills[0].title;
    const prev = document.title;
    document.title = `${drills[0].code ? drills[0].code + " — " : ""}${t || "STRIKE"}`;
    window.print();
    window.setTimeout(() => (document.title = prev), 1000);
  }

  const pages: React.ReactNode[] = [];
  if (kind === "session") pages.push(<CoverPage key="cover" title={title} date={date} age={ageGroup} coach={coach} drills={drills} />);
  drills.forEach((d, i) =>
    pages.push(
      <DrillPage key={d.id} d={d} date={date} coach={coach} kicker={kind === "session" ? `${title || "حصة تدريبية"} · تمرين ${i + 1} من ${drills.length}` : `${d.cat} · فئة ${d.age}`} />,
    ),
  );

  return (
    <div className="ds">
      <header className="ds-topbar" data-print-hide>
        <button type="button" className="ds-btn ghost" onClick={leave} aria-label="رجوع" style={{ padding: "8px 10px" }}>
          <ArrowRight size={18} />
        </button>
        <h1>إنشاء ورقة تمرين</h1>
        <span className="en hidden sm:inline">DRILL SHEET</span>
        <div className="ds-seg" role="tablist" aria-label="نوع الورقة">
          {(["drill", "session"] as SheetKind[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={clsx(kind === k && "on")} onClick={() => switchKind(k)} disabled={readOnly}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <span className="spacer" />
        {!readOnly && (
          <button type="button" className="ds-btn" onClick={save} disabled={saving}>
            <Save size={16} /> {saving ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        )}
        <button type="button" className="ds-btn ice" onClick={exportPdf}>
          <Printer size={16} /> تصدير PDF
        </button>
      </header>

      <div className="ds-workspace">
        <aside className="ds-editor" aria-label="محرر التمرين">
          {kind === "session" && (
            <>
              <h2>بيانات الحصة</h2>
              <div className="ds-field">
                <label htmlFor="sTitle">اسم الحصة</label>
                <input id="sTitle" value={title} onChange={(e) => (setTitle(e.target.value), setDirty(true))} placeholder="مثال: حصة التمرير — الأسبوع 3" readOnly={readOnly} />
              </div>
              <div className="ds-row">
                <div className="ds-field">
                  <label htmlFor="sDate">التاريخ</label>
                  <input id="sDate" className="en" dir="ltr" type="date" value={date} onChange={(e) => (setDate(e.target.value), setDirty(true))} readOnly={readOnly} />
                </div>
                <div className="ds-field">
                  <label htmlFor="sAge">الفئة</label>
                  <select id="sAge" value={ageGroup} onChange={(e) => (setAgeGroup(e.target.value), setDirty(true))} disabled={readOnly}>
                    {SHEET_AGES.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>

              <h2>تمارين الحصة</h2>
              <div className="ds-drills">
                {drills.map((d, i) => (
                  <div key={d.id} className={clsx("ds-drill-row", i === active && "on")} onClick={() => setActive(i)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setActive(i)}>
                    <span className="n">{i + 1}</span>
                    <span className={clsx("t", !d.title && "empty")}>{d.title || "تمرين بدون اسم"}</span>
                    {d.dur && <span className="d num">{d.dur} د</span>}
                    {!readOnly && (
                      <>
                        <button type="button" className="ds-icon" onClick={(e) => (e.stopPropagation(), move(i, -1))} disabled={i === 0} aria-label="تحريك لأعلى">
                          <ArrowUp size={15} />
                        </button>
                        <button type="button" className="ds-icon" onClick={(e) => (e.stopPropagation(), move(i, 1))} disabled={i === drills.length - 1} aria-label="تحريك لأسفل">
                          <ArrowDown size={15} />
                        </button>
                        <button type="button" className="ds-icon del" onClick={(e) => (e.stopPropagation(), removeDrill(i))} disabled={drills.length <= 1} aria-label="حذف">
                          <X size={15} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && (
                <button type="button" className="ds-add" onClick={addDrill}>
                  <Plus size={16} /> إضافة تمرين
                </button>
              )}
              <h2>
                بيانات التمرين <span className="num">{active + 1}</span>
              </h2>
            </>
          )}
          {kind === "drill" && <h2>بيانات التمرين</h2>}

          <div className="ds-field">
            <label htmlFor="fTitle">اسم التمرين</label>
            <input id="fTitle" value={cur.title} onChange={field("title")} placeholder="مثال: تمرير واستقبال بين الأقماع" readOnly={readOnly} />
          </div>
          <div className="ds-row">
            <div className="ds-field">
              <label htmlFor="fCode">رمز التمرين</label>
              <input id="fCode" className="en" dir="ltr" value={cur.code} onChange={field("code")} placeholder="PAS-01" readOnly={readOnly} />
            </div>
            <div className="ds-field">
              <label htmlFor="fCat">المحور</label>
              <select id="fCat" value={cur.cat} onChange={field("cat")} disabled={readOnly}>
                {SHEET_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="ds-row3">
            <div className="ds-field">
              <label htmlFor="fAge">الفئة</label>
              <select id="fAge" value={cur.age} onChange={field("age")} disabled={readOnly}>
                {SHEET_AGES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="ds-field">
              <label htmlFor="fDur">المدة (د)</label>
              <input id="fDur" className="en" dir="ltr" type="number" inputMode="numeric" value={cur.dur} onChange={field("dur")} placeholder="12" readOnly={readOnly} />
            </div>
            <div className="ds-field">
              <label htmlFor="fPlayers">اللاعبون</label>
              <input id="fPlayers" className="en" dir="ltr" value={cur.players} onChange={field("players")} placeholder="6–8" readOnly={readOnly} />
            </div>
          </div>
          <div className="ds-row">
            <div className="ds-field">
              <label htmlFor="fArea">المساحة (م)</label>
              <input id="fArea" className="en" dir="ltr" value={cur.area} onChange={field("area")} placeholder="15 × 10" readOnly={readOnly} />
            </div>
            <div className="ds-field">
              <label htmlFor="fInt">الشدة</label>
              <select id="fInt" value={cur.intensity} onChange={field("intensity")} disabled={readOnly}>
                {SHEET_INTENSITY.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
          {kind === "drill" && (
            <div className="ds-field">
              <label htmlFor="fDate">التاريخ</label>
              <input id="fDate" className="en" dir="ltr" type="date" value={date} onChange={(e) => (setDate(e.target.value), setDirty(true))} readOnly={readOnly} />
            </div>
          )}

          <h2>رسم التمرين</h2>
          <label
            className={clsx("ds-drop", over && "over")}
            onDragEnter={(e) => (e.preventDefault(), setOver(true))}
            onDragOver={(e) => (e.preventDefault(), setOver(true))}
            onDragLeave={(e) => (e.preventDefault(), setOver(false))}
            onDrop={onDrop}
          >
            <input ref={fileRef} type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0])} disabled={readOnly} />
            {uploading ? (
              <strong>جارٍ رفع الصورة…</strong>
            ) : (
              <>
                <strong>اسحب الصورة هنا</strong> أو اضغط للاختيار
                <br />
                <span style={{ fontSize: 12 }}>PNG · JPG · صورة من TacticalPad أو من الجوال</span>
              </>
            )}
            {cur.img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="thumb" src={cur.img} alt="" />
            )}
          </label>
          {cur.img && !readOnly && (
            <div className="ds-imgtools">
              <button type="button" className="ds-btn" onClick={() => patch({ img: "" })}>
                حذف الصورة
              </button>
            </div>
          )}

          <h2>المحتوى</h2>
          <div className="ds-field">
            <label htmlFor="fDesc">شرح التمرين (التنظيم وسير التمرين)</label>
            <textarea id="fDesc" value={cur.desc} onChange={field("desc")} placeholder="يقف اللاعبون في ثلاثة أزواج بمسافة 10 م..." readOnly={readOnly} />
          </div>
          <div className="ds-field">
            <label htmlFor="fObj">الأهداف</label>
            <textarea id="fObj" value={cur.obj} onChange={field("obj")} placeholder="كل هدف في سطر" readOnly={readOnly} />
            <div className="hint">كل سطر = نقطة</div>
          </div>
          <div className="ds-field">
            <label htmlFor="fEq">الأدوات</label>
            <textarea id="fEq" value={cur.eq} onChange={field("eq")} placeholder={"6 أقماع\n3 كرات"} readOnly={readOnly} />
          </div>
          <div className="ds-field">
            <label htmlFor="fPts">النقاط الفنية</label>
            <textarea id="fPts" value={cur.pts} onChange={field("pts")} placeholder={"زاوية القدم عند الاستقبال\nرفع الرأس قبل التمرير"} readOnly={readOnly} />
          </div>
          <div className="ds-field">
            <label htmlFor="fProg">التدرّج والتعديلات (اختياري)</label>
            <textarea id="fProg" value={cur.prog} onChange={field("prog")} placeholder={"أسهل: ...\nأصعب: ..."} readOnly={readOnly} />
          </div>

          <h2>التوقيع</h2>
          <div className="ds-field">
            <label>المدرب</label>
            <input value={coach} readOnly />
            <div className="hint">يُؤخذ من حسابك تلقائياً</div>
          </div>

          <div className="actions">
            {!readOnly && (
              <button type="button" className="ds-btn" onClick={save} disabled={saving}>
                <Save size={16} /> {saving ? "جارٍ الحفظ…" : "حفظ الورقة"}
              </button>
            )}
            <button type="button" className="ds-btn ice" onClick={exportPdf}>
              <Printer size={16} /> تصدير PDF (A4)
            </button>
            {!readOnly && !id && (
              <button type="button" className="ds-btn sub" onClick={reset}>
                مسح الكل
              </button>
            )}
            {id && (me.canDelete || sheet?.author_id === me.id) && (
              <button type="button" className="ds-btn danger" onClick={remove}>
                <Trash2 size={16} /> حذف الورقة
              </button>
            )}
          </div>
        </aside>

        <main className="ds-preview-wrap" ref={wrapRef} style={{ ["--ds-scale" as string]: scale }}>
          {pages.map((p, i) => (
            <div key={i} className="ds-page-scale">
              {p}
            </div>
          ))}
        </main>
      </div>

      {toast && (
        <div role="status" className={clsx("fixed z-[80] left-1/2 -translate-x-1/2 top-[calc(64px+env(safe-area-inset-top))] rounded-full px-4 py-2 text-[13px] font-bold shadow-[var(--shadow-pop)] fade-up whitespace-nowrap", toast.tone === "err" ? "bg-error text-white" : "bg-ice text-navy-900")}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

/* ---------- A4 pages ---------- */

function Head({ kicker, title, code }: { kicker: string; title: string; code?: string }) {
  return (
    <>
      <header className="ds-sheet-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/strike-logo-light.svg" alt="STRIKE" />
        <div className="t">
          <p className="kicker">{kicker}</p>
          <h1>{title}</h1>
        </div>
        <div className="code">
          <span>{code || "—"}</span>
          <small>DRILL SHEET</small>
        </div>
      </header>
      <div className="ds-accent" />
    </>
  );
}

function Foot({ coach }: { coach: string }) {
  return (
    <footer className="ds-sheet-foot">
      <span className="en">STRIKE SPORTS EDUCATION</span>
      <span className="phil" />
      <span className="coach">
        المدرب: <span>{coach || "—"}</span>
      </span>
    </footer>
  );
}

function List({ text, cls }: { text: string; cls?: string }) {
  const L = lines(text);
  return (
    <ul className={cls}>
      {L.length ? L.map((s, i) => <li key={i}>{s}</li>) : <li className="none">—</li>}
    </ul>
  );
}

export function DrillPage({ d, date, coach, kicker }: { d: SheetDrill; date: string; coach: string; kicker: string }) {
  return (
    <article className="ds-sheet">
      <Head kicker={kicker} title={d.title || "اسم التمرين"} code={d.code} />
      <div className="ds-sheet-body">
        <div className="ds-meta">
          <div>
            <b>{d.dur || "—"}</b>
            <span>دقيقة</span>
          </div>
          <div>
            <b>{d.players || "—"}</b>
            <span>لاعب</span>
          </div>
          <div>
            <b>{d.area || "—"}</b>
            <span>متر</span>
          </div>
          <div>
            <b className="ar">{d.intensity}</b>
            <span>الشدة</span>
          </div>
          <div>
            <b>{fmtDate(date)}</b>
            <span>التاريخ</span>
          </div>
        </div>

        <div className="ds-diagram">
          {d.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.img} alt="رسم التمرين" />
          ) : (
            <div className="empty">
              <svg width="40" height="32" viewBox="0 0 40 32" fill="none" stroke="#1C2D5A" strokeWidth="1.8">
                <rect x="1" y="1" width="38" height="30" rx="2" />
                <path d="M1 22l10-9 8 7 6-5 14 12" />
                <circle cx="29" cy="9" r="3" />
              </svg>
              ارفع رسم التمرين
            </div>
          )}
        </div>

        <section className="ds-sec">
          <h3>شرح التمرين</h3>
          <p className={clsx(!d.desc && "none")}>{d.desc || "—"}</p>
        </section>

        <div className="ds-cols">
          <div>
            <section className="ds-sec">
              <h3>الأهداف</h3>
              <List text={d.obj} />
            </section>
            <section className="ds-sec pts" style={{ marginTop: "4mm" }}>
              <h3 className="gold">النقاط الفنية</h3>
              <List text={d.pts} />
            </section>
          </div>
          <div>
            <section className="ds-sec">
              <h3>الأدوات</h3>
              <List text={d.eq} />
            </section>
            {lines(d.prog).length > 0 && (
              <section className="ds-sec" style={{ marginTop: "4mm" }}>
                <h3>التدرّج والتعديلات</h3>
                <List text={d.prog} />
              </section>
            )}
          </div>
        </div>
      </div>
      <Foot coach={coach} />
    </article>
  );
}

export function CoverPage({ title, date, age, coach, drills }: { title: string; date: string; age: string; coach: string; drills: SheetDrill[] }) {
  const total = totalMinutes(drills);
  const withImg = drills.filter((d) => d.img).slice(0, 6);
  return (
    <article className="ds-sheet">
      <Head kicker={`حصة تدريبية · فئة ${age}`} title={title || "اسم الحصة"} code={`${drills.length} DRILLS`} />
      <div className="ds-sheet-body">
        <div className="ds-meta">
          <div>
            <b>{drills.length}</b>
            <span>تمرين</span>
          </div>
          <div>
            <b>{total || "—"}</b>
            <span>دقيقة إجمالي</span>
          </div>
          <div>
            <b>{age}</b>
            <span>الفئة</span>
          </div>
          <div>
            <b className="ar">{coach || "—"}</b>
            <span>المدرب</span>
          </div>
          <div>
            <b>{fmtDate(date)}</b>
            <span>التاريخ</span>
          </div>
        </div>

        <section className="ds-sec">
          <h3>خطة الحصة</h3>
          <table className="ds-plan">
            <thead>
              <tr>
                <th>#</th>
                <th>التمرين</th>
                <th>المحور</th>
                <th>الشدة</th>
                <th>المدة</th>
              </tr>
            </thead>
            <tbody>
              {drills.map((d, i) => (
                <tr key={d.id}>
                  <td className="n">{i + 1}</td>
                  <td>
                    <strong>{d.title || "تمرين بدون اسم"}</strong>
                    {d.code && (
                      <span className="num" style={{ color: "var(--ds-ink-2)", fontSize: "10pt", marginInlineStart: "2mm" }}>
                        {d.code}
                      </span>
                    )}
                  </td>
                  <td>{d.cat}</td>
                  <td>{d.intensity}</td>
                  <td className="num">{d.dur ? `${d.dur} د` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>الإجمالي</td>
                <td className="num">{total ? `${total} د` : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {withImg.length > 0 && (
          <section className="ds-sec">
            <h3>نظرة سريعة</h3>
            <div className="ds-plan-thumbs">
              {withImg.map((d) => (
                <div key={d.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.img} alt="" />
                  <span className="lbl">
                    <span className="num">{drills.indexOf(d) + 1}</span> · {d.title || "تمرين"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <Foot coach={coach} />
    </article>
  );
}

/** downscale to ≤1600px JPEG so pages stay light */
function shrink(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const sc = Math.min(1, DIAGRAM_MAX / Math.max(im.width, im.height));
      const c = document.createElement("canvas");
      c.width = Math.round(im.width * sc);
      c.height = Math.round(im.height * sc);
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/jpeg", 0.9);
    };
    im.onerror = reject;
    im.src = url;
  });
}
