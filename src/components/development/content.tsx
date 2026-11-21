import { format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { Dots } from "@/components/development/charts";
import type { PlayerContent } from "@/lib/content";

/** «المحتوى التدريبي» في ملف اللاعب: ماذا أخذ من الحصص التي حضرها، وماذا فاته */
export default function ContentSection({ c }: { c: PlayerContent }) {
  if (!c.marked) return null;
  const techMax = Math.max(1, ...c.tech.map((t) => t.offered));
  const empty = !c.tech.length && !c.physTracked;

  return (
    <section className="flex flex-col gap-3" aria-label="المحتوى التدريبي">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-extrabold text-navy text-[18px]">المحتوى التدريبي</h2>
        <span className="text-ink-2 text-[12.5px]">
          حضر <b className="num text-navy text-[14px]">{c.attended}</b> من <b className="num text-navy text-[14px]">{c.marked}</b> حصة · محتوى <b className="num text-navy text-[14px]">{c.covered}</b> منها مسجّل
        </span>
      </div>

      {empty ? (
        <div className="card p-5 text-ink-2 text-[14px] leading-relaxed">ما فيه محتوى مسجّل لحصص هذا اللاعب بعد. المحتوى ينحسب من تمارين الحصة في التقويم، فأضف تمارين كل حصة هناك ويظهر هنا تلقائياً.</div>
      ) : (
        <>
          {(c.alerts.length > 0 || c.needSquad > 0) && (
            <div className="card p-4 flex flex-col gap-2.5">
              <div className="font-extrabold text-navy text-[15px]">يحتاج انتباه</div>
              {c.alerts.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span aria-hidden className={clsx("mt-[7px] h-2.5 w-2.5 rounded-full shrink-0", a.tone === "gap" ? "bg-error" : "bg-gold")} />
                  <p className="text-[14px] leading-relaxed text-navy">
                    <b>{a.title}:</b> {a.text}
                  </p>
                </div>
              ))}
              {c.needSquad > 0 && (
                <div className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-[7px] h-2.5 w-2.5 rounded-full shrink-0 bg-silver-200" />
                  <p className="text-[14px] leading-relaxed text-navy">
                    <b>مجموعته غير محددة:</b> <span className="num">{c.needSquad}</span> حصة كانت مقسومة A و B وما انحدد مع أي مجموعة تدرّب، فانحسبت له التمارين المشتركة فقط. حددها من صفحة الحضور.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2 items-start">
            {/* technical */}
            <div className="card p-4 sm:p-5 flex flex-col gap-3.5">
              <div className="flex items-baseline justify-between">
                <div className="font-extrabold text-navy text-[16px]">المحتوى الفني</div>
                <span className="text-ink-2 text-[11.5px]">آخر تقييم من 5</span>
              </div>
              <div className="flex gap-4 text-ink-2 text-[11.5px]">
                <Key cls="bg-navy" label="حضرها اللاعب" />
                <Key cls="bg-silver-200" label="انعطت لمجموعته" />
              </div>
              {c.tech.length ? (
                c.tech.map((t) => (
                  <div key={t.key} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-bold text-navy">
                        {t.label} <span className="num text-ink-2 font-semibold">{t.key}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {t.score === null ? <span className="text-ink-2 text-[11.5px]">بدون تقييم</span> : <Dots value={t.score} />}
                        <span dir="ltr" className={clsx("num text-[17px] font-bold min-w-[34px] text-start", t.offered >= 3 && t.attended / t.offered <= 0.5 ? "text-error" : "text-navy")}>
                          {t.attended}/{t.offered}
                        </span>
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-silver-200" style={{ width: `${(t.offered / techMax) * 100}%` }} role="img" aria-label={`${t.label}: حضر ${t.attended} من ${t.offered} حصة`}>
                      <div className="h-3 rounded-full bg-navy" style={{ width: `${(t.attended / t.offered) * 100}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-ink-2 text-[13px]">ما فيه محاور فنية مسجّلة لحصصه بعد.</p>
              )}
            </div>

            {/* physical */}
            <div className="card p-4 sm:p-5 flex flex-col gap-3.5">
              <div className="flex items-baseline justify-between">
                <div className="font-extrabold text-navy text-[16px]">المحتوى البدني</div>
                <span className="text-ink-2 text-[11.5px]">عدد الحصص</span>
              </div>
              {c.physTracked ? (
                <>
                  <div className="flex gap-4 text-ink-2 text-[11.5px]">
                    <Key cls="bg-navy" label="هدف رئيسي" />
                    <Key cls="bg-ice" label="هدف ثانوي" />
                  </div>
                  <div className="grid grid-cols-[minmax(96px,128px)_1fr_auto] items-center gap-x-2.5 gap-y-3">
                    {c.phys.map((p) => (
                      <div key={p.key} className="contents">
                        <span className="text-[14px] font-bold text-navy">{p.label}</span>
                        <div className="h-3 rounded-full bg-silver-100 flex gap-[2px]" role="img" aria-label={`${p.label}: ${p.main} رئيسي و${p.extra} ثانوي`}>
                          {p.main > 0 && <div className="h-3 rounded-full bg-navy" style={{ width: `${(p.main / c.physMax) * 100}%` }} />}
                          {p.extra > 0 && <div className="h-3 rounded-full bg-ice" style={{ width: `${(p.extra / c.physMax) * 100}%` }} />}
                        </div>
                        <span dir="ltr" className="num text-[16px] font-bold text-navy min-w-[40px] text-start">
                          {p.main} + {p.extra}
                        </span>
                      </div>
                    ))}
                  </div>
                  {c.physNever.length > 0 && (
                    <div className="border-t border-silver-200 pt-3 flex flex-col gap-2">
                      <div className="text-error text-[12.5px] font-bold">ما مرّت عليه أبداً</div>
                      <div className="flex flex-wrap gap-1.5">
                        {c.physNever.map((l) => (
                          <span key={l} className="chip border border-silver-200 bg-white text-navy px-3 h-7 text-[12.5px]">
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-ink-2 text-[13px] leading-relaxed">الأهداف البدنية تبدأ تنحسب من أوراق التمرين اللي فيها «الهدف البدني». أضفه لأوراق الحصص ويظهر هنا.</p>
              )}
            </div>
          </div>

          {/* last sessions */}
          <div className="card p-4 sm:p-5 flex flex-col gap-1">
            <div className="font-extrabold text-navy text-[16px] mb-1">آخر الحصص</div>
            {c.recent.map((s) => (
              <div key={s.date} className="grid grid-cols-[44px_1fr_auto] items-center gap-2.5 py-2 border-b border-silver-100 last:border-b-0">
                <span dir="ltr" className="num text-[15px] font-semibold text-ink-2 text-end" title={format(parseISO(s.date), "EEEE d MMMM", { locale: ar })}>
                  {format(parseISO(s.date), "d/M")}
                </span>
                <span className="text-[13.5px] text-navy min-w-0">
                  {s.planned ? (
                    <>
                      {s.tech.join(" · ") || "بدون محور فني"}
                      {s.main.length > 0 && (
                        <>
                          {" · "}
                          <b>{s.main.join(" + ")}</b>
                        </>
                      )}
                      {s.extra.length > 0 && <span className="text-ink-2"> + {s.extra.join(" + ")}</span>}
                    </>
                  ) : (
                    <span className="text-ink-2">المحتوى غير مسجّل بالتقويم</span>
                  )}
                </span>
                <span className={clsx("chip h-7 px-2.5 text-[11.5px] font-bold", s.present ? "bg-navy text-white" : "border border-error/60 text-error bg-white")}>
                  {s.present ? `حاضر${s.squad ? ` ${s.squad}` : ""}` : "غائب"}
                </span>
              </div>
            ))}
            <p className="text-ink-2 text-[11.5px] mt-1.5">الهدف البدني الرئيسي بالخط العريض.</p>
          </div>
        </>
      )}
    </section>
  );
}

function Key({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={clsx("h-2 w-3.5 rounded", cls)} />
      {label}
    </span>
  );
}
