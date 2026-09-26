"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Save, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, startOfWeek } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { useHub } from "./store";
import { Field, PlatformSelect, PlatformChip, fmtNum, EmptyState } from "@/components/ui";
import { PLATFORMS, platformLabel, metricLabel, type MetricRow, type Platform } from "@/lib/types";

const WEEK_START = 6;
type Key = "followers" | "reach" | "engagement" | "views" | "leads" | "spend";
const KEYS: { key: Key; label: string }[] = [
  { key: "followers", label: "المتابعين" },
  { key: "reach", label: "الوصول" },
  { key: "engagement", label: "التفاعل" },
  { key: "views", label: "المشاهدات" },
  { key: "leads", label: "طلبات التسجيل" },
  { key: "spend", label: "الصرف (د.ك)" },
];

export default function MetricsTab() {
  const { data, insert, update, remove } = useHub();
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [week, setWeek] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: WEEK_START }), "yyyy-MM-dd"));
  const [vals, setVals] = useState<Record<Key, string>>({ followers: "", reach: "", engagement: "", views: "", leads: "", spend: "" });
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [series, setSeries] = useState<Key>("followers");
  const [showAll, setShowAll] = useState(false);

  const existing = data.metrics.find((m) => m.platform === platform && m.week_start === week);

  async function save(e: FormEvent) {
    e.preventDefault();
    const values = {
      platform,
      week_start: week,
      followers: Number(vals.followers) || 0,
      reach: Number(vals.reach) || 0,
      engagement: Number(vals.engagement) || 0,
      views: Number(vals.views) || 0,
      leads: Number(vals.leads) || 0,
      spend: Number(vals.spend) || 0,
      notes,
    };
    if (existing) await update("metrics", existing.id, values);
    else await insert("metrics", values);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function loadExisting(p: Platform, w: string) {
    const row = data.metrics.find((m) => m.platform === p && m.week_start === w);
    setVals({
      followers: row ? String(row.followers) : "",
      reach: row ? String(row.reach) : "",
      engagement: row ? String(row.engagement) : "",
      views: row ? String(row.views) : "",
      leads: row ? String(row.leads) : "",
      spend: row ? String(row.spend) : "",
    });
    setNotes(row?.notes ?? "");
  }

  const perPlatform = useMemo(() => {
    return PLATFORMS.filter((p) => p.value !== "general")
      .map((p) => {
        const rows = data.metrics.filter((m) => m.platform === p.value).sort((a, b) => a.week_start.localeCompare(b.week_start));
        return { platform: p.value, rows };
      })
      .filter((x) => x.rows.length > 0);
  }, [data.metrics]);

  const goalActuals = data.goals
    .filter((g) => g.platform !== "general" && ["followers", "views", "leads"].includes(g.metric))
    .map((g) => {
      const rows = data.metrics.filter((m) => m.platform === g.platform).sort((a, b) => b.week_start.localeCompare(a.week_start));
      const latest = rows[0];
      const actual = latest ? (latest[g.metric as Key] as number) : null;
      return { g, actual };
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[320px_1fr] items-start">
        {/* weekly entry */}
        <form onSubmit={save} className="card p-4 sm:p-5 flex flex-col gap-3">
          <div className="text-navy font-extrabold text-[17px]">أرقام الأسبوع</div>
          <p className="text-ink-2 text-xs -mt-2">سجّل الأرقام كل أسبوع من إحصائيات كل منصة. نفس المنصة ونفس الأسبوع يتحدّث ما يتكرر.</p>
          <Field label="المنصة">
            <PlatformSelect
              value={platform}
              includeGeneral={false}
              onChange={(p) => {
                setPlatform(p);
                loadExisting(p, week);
              }}
            />
          </Field>
          <Field label="بداية الأسبوع (السبت)">
            <input
              className="field num"
              dir="ltr"
              type="date"
              value={week}
              onChange={(e) => {
                setWeek(e.target.value);
                loadExisting(platform, e.target.value);
              }}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {KEYS.map((k) => (
              <Field key={k.key} label={k.label}>
                <input className="field num" dir="ltr" type="number" step="any" min={0} value={vals[k.key]} onChange={(e) => setVals({ ...vals, [k.key]: e.target.value })} placeholder="0" />
              </Field>
            ))}
          </div>
          <Field label="ملاحظة">
            <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي شي أثّر على الأرقام هذا الأسبوع" />
          </Field>
          <button className={clsx("btn-primary", saved && "bg-ice text-navy-900")}>
            <Save size={17} /> {saved ? "تم الحفظ" : existing ? "تحديث الأسبوع" : "حفظ"}
          </button>
        </form>

        {/* overview */}
        <div className="flex flex-col gap-4">
          {goalActuals.length > 0 && (
            <div className="card p-4">
              <div className="text-navy font-extrabold text-[15px] mb-3">الأهداف مقابل الواقع</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {goalActuals.map(({ g, actual }) => {
                  const pct = actual !== null && g.target_value > 0 ? Math.round((actual / g.target_value) * 100) : null;
                  return (
                    <div key={g.id} className="flex items-center gap-3 rounded-xl border border-silver-200 px-3 py-2">
                      <PlatformChip platform={g.platform} />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-navy text-[14px] truncate">{g.title}</div>
                        <div className="text-ink-2 text-xs">{metricLabel(g.metric)} · آخر رقم مسجل</div>
                      </div>
                      <div className="text-end">
                        <div className="num text-navy font-bold text-[18px] leading-none">{actual === null ? "—" : fmtNum(actual)}</div>
                        <div className={clsx("num text-xs", pct !== null && pct >= 100 ? "text-gold" : "text-ink-2")}>{pct === null ? `الهدف ${fmtNum(g.target_value)}` : `${pct}% من ${fmtNum(g.target_value)}`}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {perPlatform.length === 0 ? (
            <EmptyState title="لا توجد أرقام بعد" hint="أدخل أرقام أول أسبوع وبيطلع لك اتجاه كل منصة هنا." />
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {KEYS.map((k) => (
                  <button key={k.key} onClick={() => setSeries(k.key)} className={clsx("chip px-3 py-1 text-[13px]", series === k.key ? "bg-navy text-white" : "bg-white border border-silver-200 text-navy hover:border-ice")}>
                    {k.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {perPlatform.map(({ platform: p, rows }) => (
                  <TrendCard key={p} platform={p} rows={rows} metric={series} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {data.metrics.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-[14px] min-w-[720px]">
            <thead className="bg-navy text-white text-xs">
              <tr>
                <th className="text-start px-3 py-2.5 font-bold">المنصة</th>
                <th className="text-start px-3 py-2.5 font-bold">الأسبوع</th>
                {KEYS.map((k) => (
                  <th key={k.key} className="text-end px-3 py-2.5 font-bold">
                    {k.label}
                  </th>
                ))}
                <th className="px-2" />
              </tr>
            </thead>
            <tbody>
              {(showAll ? data.metrics : data.metrics.slice(0, 12)).map((m, i) => (
                <tr key={m.id} className={i % 2 ? "bg-silver-100/70" : "bg-white"}>
                  <td className="px-3 py-2">
                    <PlatformChip platform={m.platform} full />
                  </td>
                  <td className="px-3 py-2 num text-navy font-bold" dir="ltr">
                    {m.week_start}
                  </td>
                  {KEYS.map((k) => (
                    <td key={k.key} className="px-3 py-2 num text-end text-navy">
                      {fmtNum(m[k.key])}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-end">
                    <button onClick={() => confirm("حذف هذا الأسبوع؟") && remove("metrics", m.id)} className="p-1.5 rounded-lg text-ink-2 hover:bg-error-100 hover:text-error" aria-label="حذف">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.metrics.length > 12 && (
            <div className="p-2 text-center border-t border-silver-200">
              <button className="btn-ghost h-8 text-sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "عرض آخر 12 فقط" : `عرض الكل (${data.metrics.length})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrendCard({ platform, rows, metric }: { platform: Platform; rows: MetricRow[]; metric: Key }) {
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const cur = last[metric] as number;
  const delta = prev ? cur - (prev[metric] as number) : null;
  const pts = rows.slice(-10).map((r) => r[metric] as number);
  const [hover, setHover] = useState<number | null>(null);

  const W = 260, H = 72, PX = 6, PY = 8;
  const min = Math.min(...pts), max = Math.max(...pts);
  const x = (i: number) => (pts.length === 1 ? W / 2 : PX + (i * (W - PX * 2)) / (pts.length - 1));
  const y = (v: number) => (max === min ? H / 2 : PY + (H - PY * 2) * (1 - (v - min) / (max - min)));
  const path = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${path} L${x(pts.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const shown = rows.slice(-10);

  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <PlatformChip platform={platform} />
        <span className="font-bold text-navy text-[14px]">{platformLabel(platform)}</span>
        <span className="text-ink-2 text-xs ms-auto num" dir="ltr">
          {format(new Date(last.week_start), "d MMM", { locale: ar })}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <span className="num text-navy text-[30px] font-bold leading-none">{fmtNum(hover !== null ? pts[hover] : cur)}</span>
        {delta !== null && hover === null && (
          <span className={clsx("num text-sm font-bold flex items-center gap-0.5 pb-1", delta > 0 ? "text-ice-600" : delta < 0 ? "text-error" : "text-ink-2")}>
            {delta > 0 ? <TrendingUp size={14} /> : delta < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
            {delta > 0 ? "+" : ""}
            {fmtNum(delta)}
          </span>
        )}
        {hover !== null && <span className="text-ink-2 text-xs pb-1 num" dir="ltr">{shown[hover].week_start}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[72px]" onMouseLeave={() => setHover(null)} role="img" aria-label={`اتجاه ${platformLabel(platform)}`}>
        <defs>
          <linearGradient id={`g-${platform}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#4DA8FF" stopOpacity="0.28" />
            <stop offset="1" stopColor="#4DA8FF" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={PX} x2={W - PX} y1={PY + (H - PY * 2) * t} y2={PY + (H - PY * 2) * t} stroke="#E3E8EF" strokeWidth="1" />
        ))}
        {pts.length > 1 && <path d={area} fill={`url(#g-${platform})`} />}
        <path d={path} fill="none" stroke="#1C2D5A" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((v, i) => (
          <g key={i} onMouseEnter={() => setHover(i)}>
            <rect x={x(i) - 12} y={0} width={24} height={H} fill="transparent" />
            <circle cx={x(i)} cy={y(v)} r={hover === i ? 5 : i === pts.length - 1 ? 4 : 0} fill="#4DA8FF" stroke="#fff" strokeWidth="2" />
          </g>
        ))}
      </svg>
    </div>
  );
}
