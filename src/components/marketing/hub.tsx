"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Target, Map, Lightbulb, CalendarDays, KanbanSquare, LineChart, History } from "lucide-react";
import clsx from "clsx";
import { HubProvider, useHub, type HubData } from "./store";
import GoalsTab from "./goals-tab";
import PlanTab from "./plan-tab";
import BrainstormTab from "./brainstorm-tab";
import CalendarTab from "./calendar-tab";
import BoardTab from "./board-tab";
import MetricsTab from "./metrics-tab";
import ActivityDrawer from "./activity-drawer";
import { Avatar } from "@/components/ui";

const TABS = [
  { id: "goals", label: "الأهداف", icon: Target },
  { id: "plan", label: "الخطة", icon: Map },
  { id: "ideas", label: "العصف الذهني", icon: Lightbulb },
  { id: "calendar", label: "التقويم", icon: CalendarDays },
  { id: "board", label: "سير العمل", icon: KanbanSquare },
  { id: "metrics", label: "المتابعة", icon: LineChart },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function MarketingHub({ initial, me }: { initial: HubData; me: { id: string; name: string; isOwner: boolean } }) {
  return (
    <HubProvider initial={initial} me={me}>
      <HubInner />
    </HubProvider>
  );
}

function navigateHash(id: string) {
  window.history.replaceState(null, "", `#${id}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function HubInner() {
  const { online, connected, setTab, me, data, toasts } = useHub();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const tab: TabId = TABS.some((t) => `#${t.id}` === hash) ? (hash.slice(1) as TabId) : "goals";
  const setTabState = (id: TabId) => navigateHash(id);
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    setTab(tab);
  }, [tab, setTab]);

  const others = online.filter((p) => p.id !== me.id);
  const reviewCount = data.posts.filter((p) => p.status === "review").length;

  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 max-w-[1400px]">
      {/* header */}
      <div className="flex items-center sm:items-end justify-between gap-3 sm:gap-4 mb-4 sm:mb-5">
        <div className="min-w-0">
          <h1 className="display text-navy text-[26px] sm:text-[40px] leading-none">مركز التسويق</h1>
          <p className="text-ink-2 mt-1.5 text-[15px] hidden sm:block">خطة، أفكار، تقويم، ومتابعة — كل شي يتحدّث للكل باللحظة</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2 rounded-full bg-white border border-silver-200 px-2.5 sm:px-3 h-9" title={connected ? "متصل — التحديثات لحظية" : "جارٍ الاتصال…"}>
            <span className={clsx("h-2 w-2 rounded-full", connected ? "bg-ice live-dot" : "bg-silver")} />
            <span className="text-xs font-bold text-navy hidden sm:inline">{connected ? "متصل" : "جارٍ الاتصال…"}</span>
            {others.length > 0 && (
              <div className="flex -space-x-1.5 space-x-reverse ms-1">
                {others.slice(0, 5).map((p) => (
                  <Avatar key={p.id} name={p.name} size={24} tone="ice" className="ring-2 ring-white" />
                ))}
                {others.length > 5 && <span className="num text-xs text-ink-2 ms-1">+{others.length - 5}</span>}
              </div>
            )}
          </div>
          <button
            onClick={() => setActivityOpen(true)}
            className="btn-outline h-9 px-3 text-sm"
            title="سجل النشاط"
          >
            <History size={16} />
            <span className="hidden sm:inline">النشاط</span>
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="sticky top-[calc(56px+env(safe-area-inset-top))] md:top-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-0 bg-silver-100/85 backdrop-blur pt-1 pb-3">
        <div className="flex gap-1 overflow-x-auto rounded-2xl bg-white border border-silver-200 p-1 [scrollbar-width:none] tabs-scroll">
          {TABS.map(({ id, label, icon: Icon }) => {
            const here = online.filter((p) => p.tab === id && p.id !== me.id);
            return (
              <button
                key={id}
                onClick={(e) => {
                  setTabState(id);
                  e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
                }}
                className={clsx(
                  "relative flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 min-h-[42px] text-[14px] font-bold transition",
                  tab === id ? "bg-navy text-white shadow" : "text-navy hover:bg-navy-50",
                )}
              >
                <Icon size={16} className={tab === id ? "text-ice" : "text-ink-2"} />
                {label}
                {id === "board" && reviewCount > 0 && (
                  <span className={clsx("num chip px-1.5 py-0 text-[11px]", tab === id ? "bg-gold text-navy-900" : "bg-gold-100 text-navy-900")}>{reviewCount}</span>
                )}
                {here.length > 0 && (
                  <span className="absolute -top-1 -end-1 flex -space-x-1 space-x-reverse">
                    {here.slice(0, 3).map((p) => (
                      <Avatar key={p.id} name={p.name} size={16} tone="ice" className="ring-2 ring-white" />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 fade-up" key={tab}>
        {tab === "goals" && <GoalsTab />}
        {tab === "plan" && <PlanTab />}
        {tab === "ideas" && <BrainstormTab onOpenCalendar={() => setTabState("calendar")} />}
        {tab === "calendar" && <CalendarTab />}
        {tab === "board" && <BoardTab />}
        {tab === "metrics" && <MetricsTab />}
      </div>

      <ActivityDrawer open={activityOpen} onClose={() => setActivityOpen(false)} />

      {/* toasts */}
      <div aria-live="polite" className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] md:bottom-6 inset-x-4 md:inset-x-auto md:end-6 z-[60] flex flex-col gap-2 items-center md:items-end pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className={clsx("fade-up rounded-xl px-4 py-2.5 text-sm font-bold shadow-[var(--shadow-pop)] pointer-events-auto", t.kind === "error" ? "bg-error text-white" : "bg-navy text-white")}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
