"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Activity, Goal, Idea, MetricRow, PlanItem, Post, StaffName } from "@/lib/types";

export type HubData = {
  goals: Goal[];
  plan: PlanItem[];
  ideas: Idea[];
  posts: Post[];
  metrics: MetricRow[];
  activity: Activity[];
  staff: StaffName[];
};

type TableKey = "mk_goals" | "mk_plan_items" | "mk_ideas" | "mk_posts" | "mk_metrics" | "mk_activity";
const TABLE_TO_KEY: Record<TableKey, keyof HubData> = {
  mk_goals: "goals",
  mk_plan_items: "plan",
  mk_ideas: "ideas",
  mk_posts: "posts",
  mk_metrics: "metrics",
  mk_activity: "activity",
};
const KEY_TO_TABLE = Object.fromEntries(Object.entries(TABLE_TO_KEY).map(([t, k]) => [k, t])) as Record<
  keyof HubData,
  TableKey
>;

type Row = { id: string | number } & Record<string, unknown>;
type Action =
  | { type: "upsert"; key: keyof HubData; row: Row }
  | { type: "remove"; key: keyof HubData; id: string | number }
  | { type: "replace"; key: keyof HubData; rows: Row[] };

function sortRows(key: keyof HubData, rows: Row[]) {
  const r = [...rows];
  if (key === "activity") return r.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 60);
  if (key === "metrics") return r.sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)));
  if (key === "staff") return r.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), "ar"));
  return r.sort(
    (a, b) => Number(a.position) - Number(b.position) || String(a.created_at).localeCompare(String(b.created_at)),
  );
}

function reducer(state: HubData, action: Action): HubData {
  const list = state[action.type === "replace" ? action.key : action.key] as unknown as Row[];
  switch (action.type) {
    case "upsert": {
      const exists = list.some((r) => r.id === action.row.id);
      const next = exists ? list.map((r) => (r.id === action.row.id ? { ...r, ...action.row } : r)) : [...list, action.row];
      return { ...state, [action.key]: sortRows(action.key, next) };
    }
    case "remove":
      return { ...state, [action.key]: list.filter((r) => r.id !== action.id) };
    case "replace":
      return { ...state, [action.key]: sortRows(action.key, action.rows) };
  }
}

export type Presence = { id: string; name: string; tab: string; online_at: string };

type Ctx = {
  data: HubData;
  me: { id: string; name: string; isOwner: boolean };
  online: Presence[];
  connected: boolean;
  setTab: (tab: string) => void;
  /** optimistic insert; returns the created row (with server id) */
  insert: <T extends Row>(key: keyof HubData, values: Partial<T>) => Promise<T | null>;
  update: <T extends Row>(key: keyof HubData, id: string, values: Partial<T>) => Promise<boolean>;
  remove: (key: keyof HubData, id: string) => Promise<boolean>;
  refresh: (key: keyof HubData) => Promise<void>;
};

const HubContext = createContext<Ctx | null>(null);
export const useHub = () => {
  const c = useContext(HubContext);
  if (!c) throw new Error("useHub outside provider");
  return c;
};

export function HubProvider({
  initial,
  me,
  children,
}: {
  initial: HubData;
  me: { id: string; name: string; isOwner: boolean };
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, dispatch] = useReducer(reducer, initial);
  const [online, setOnline] = useState<Presence[]>([]);
  const [connected, setConnected] = useState(false);
  const tabRef = useRef("goals");
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refresh = useCallback(
    async (key: keyof HubData) => {
      if (key === "staff") {
        const { data: rows } = await supabase.rpc("staff_names");
        if (rows) dispatch({ type: "replace", key, rows });
        return;
      }
      let q = supabase.from(KEY_TO_TABLE[key]).select("*");
      if (key === "ideas") q = q.eq("archived", false);
      if (key === "activity") q = q.order("created_at", { ascending: false }).limit(40);
      if (key === "metrics") q = q.order("week_start", { ascending: false }).limit(200);
      const { data: rows } = await q;
      if (rows) dispatch({ type: "replace", key, rows: rows as Row[] });
    },
    [supabase],
  );

  // realtime: postgres changes on every hub table
  useEffect(() => {
    const handler = (key: keyof HubData) => (payload: RealtimePostgresChangesPayload<Row>) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Row)?.id;
        if (id !== undefined) dispatch({ type: "remove", key, id });
        return;
      }
      const row = payload.new as Row;
      if (key === "ideas" && row.archived) {
        dispatch({ type: "remove", key, id: row.id });
        return;
      }
      dispatch({ type: "upsert", key, row });
    };
    const ch = supabase.channel("mk-changes");
    (Object.keys(TABLE_TO_KEY) as TableKey[]).forEach((table) => {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, handler(TABLE_TO_KEY[table]));
    });
    ch.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") {
        // catch anything missed while (re)connecting
        (Object.values(TABLE_TO_KEY) as (keyof HubData)[]).forEach((k) => refresh(k));
      }
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, refresh]);

  // presence: who is here and on which tab
  useEffect(() => {
    const ch = supabase.channel("mk-presence", { config: { presence: { key: me.id } } });
    presenceRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<Presence>();
      const list: Presence[] = [];
      Object.values(state).forEach((arr) => {
        if (arr[0]) list.push(arr[0]);
      });
      setOnline(list.sort((a, b) => a.name.localeCompare(b.name, "ar")));
    });
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ id: me.id, name: me.name, tab: tabRef.current, online_at: new Date().toISOString() });
      }
    });
    return () => {
      supabase.removeChannel(ch);
      presenceRef.current = null;
    };
  }, [supabase, me.id, me.name]);

  const setTab = useCallback(
    (tab: string) => {
      tabRef.current = tab;
      presenceRef.current?.track({ id: me.id, name: me.name, tab, online_at: new Date().toISOString() });
    },
    [me.id, me.name],
  );

  const insert = useCallback(
    async <T extends Row>(key: keyof HubData, values: Partial<T>) => {
      const { data: row, error } = await supabase.from(KEY_TO_TABLE[key]).insert(values as never).select("*").single();
      if (error || !row) {
        console.error(error);
        return null;
      }
      dispatch({ type: "upsert", key, row: row as Row });
      return row as T;
    },
    [supabase],
  );

  const update = useCallback(
    async <T extends Row>(key: keyof HubData, id: string, values: Partial<T>) => {
      dispatch({ type: "upsert", key, row: { id, ...values } as Row });
      const { error } = await supabase.from(KEY_TO_TABLE[key]).update(values as never).eq("id", id);
      if (error) {
        console.error(error);
        refresh(key);
        return false;
      }
      return true;
    },
    [supabase, refresh],
  );

  const remove = useCallback(
    async (key: keyof HubData, id: string) => {
      dispatch({ type: "remove", key, id });
      const { error } = await supabase.from(KEY_TO_TABLE[key]).delete().eq("id", id);
      if (error) {
        console.error(error);
        refresh(key);
        return false;
      }
      return true;
    },
    [supabase, refresh],
  );

  const value = useMemo<Ctx>(
    () => ({ data, me, online, connected, setTab, insert, update, remove, refresh }),
    [data, me, online, connected, setTab, insert, update, remove, refresh],
  );

  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}
