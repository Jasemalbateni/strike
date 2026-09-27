"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Activity, Comment, Goal, Idea, MetricRow, Note, PlanItem, Post, StaffName } from "@/lib/types";

export type HubData = {
  goals: Goal[];
  plan: PlanItem[];
  ideas: Idea[];
  posts: Post[];
  metrics: MetricRow[];
  activity: Activity[];
  comments: Comment[];
  notes: Note[];
  staff: StaffName[];
};

type TableKey = "mk_goals" | "mk_plan_items" | "mk_ideas" | "mk_posts" | "mk_metrics" | "mk_activity" | "mk_comments" | "mk_notes";
const TABLE_TO_KEY: Record<TableKey, keyof HubData> = {
  mk_goals: "goals",
  mk_plan_items: "plan",
  mk_ideas: "ideas",
  mk_posts: "posts",
  mk_metrics: "metrics",
  mk_activity: "activity",
  mk_comments: "comments",
  mk_notes: "notes",
};
const KEY_TO_TABLE = Object.fromEntries(Object.entries(TABLE_TO_KEY).map(([t, k]) => [k, t])) as Record<
  keyof HubData,
  TableKey
>;

type Row = { id: string | number } & Record<string, unknown>;
type Action =
  | { type: "upsert"; key: keyof HubData; row: Row } // full row from the server
  | { type: "patch"; key: keyof HubData; row: Row } // partial row: only merges into an existing row
  | { type: "remove"; key: keyof HubData; id: string | number }
  | { type: "replace"; key: keyof HubData; rows: Row[] };

function sortRows(key: keyof HubData, rows: Row[]) {
  const r = [...rows];
  const byCreatedAsc = (a: Row, b: Row) => String(a.created_at).localeCompare(String(b.created_at));
  if (key === "activity") return r.sort((a, b) => -byCreatedAsc(a, b)).slice(0, 60);
  if (key === "comments") return r.sort(byCreatedAsc);
  if (key === "notes")
    return r.sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(a.done) - Number(b.done) || String(b.updated_at).localeCompare(String(a.updated_at)));
  if (key === "metrics") return r.sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)));
  if (key === "staff") return r.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), "ar"));
  if (key === "ideas") return r.sort((a, b) => Number(a.position) - Number(b.position) || -byCreatedAsc(a, b));
  return r.sort((a, b) => Number(a.position) - Number(b.position) || byCreatedAsc(a, b));
}

/** rows that should not be in the live list at all */
function hidden(key: keyof HubData, row: Row) {
  return (key === "ideas" || key === "notes") && row.archived === true;
}

function reducer(state: HubData, action: Action): HubData {
  const list = state[action.key] as unknown as Row[];
  switch (action.type) {
    case "upsert": {
      if (hidden(action.key, action.row)) return { ...state, [action.key]: list.filter((r) => r.id !== action.row.id) };
      const exists = list.some((r) => r.id === action.row.id);
      const next = exists ? list.map((r) => (r.id === action.row.id ? { ...r, ...action.row } : r)) : [...list, action.row];
      return { ...state, [action.key]: sortRows(action.key, next) };
    }
    case "patch": {
      if (!list.some((r) => r.id === action.row.id)) return state;
      const next = list.map((r) => (r.id === action.row.id ? { ...r, ...action.row } : r)).filter((r) => !hidden(action.key, r));
      return { ...state, [action.key]: sortRows(action.key, next) };
    }
    case "remove":
      return { ...state, [action.key]: list.filter((r) => r.id !== action.id) };
    case "replace":
      return { ...state, [action.key]: sortRows(action.key, action.rows.filter((r) => !hidden(action.key, r))) };
  }
}

export type Presence = { id: string; name: string; tab: string; online_at: string };
export type Me = { id: string; name: string; isOwner: boolean; mentionsSeenAt: string };
export type Toast = { id: number; text: string; kind: "error" | "info" };

type Ctx = {
  data: HubData;
  me: Me;
  online: Presence[];
  connected: boolean;
  toasts: Toast[];
  notify: (text: string, kind?: Toast["kind"]) => void;
  setTab: (tab: string) => void;
  /** optimistic insert; returns the created row (with server id) or null on failure */
  insert: <T extends Row>(key: keyof HubData, values: Partial<T>) => Promise<T | null>;
  /** optimistic patch of an existing row; false on failure */
  update: <T extends Row>(key: keyof HubData, id: string, values: Partial<T>) => Promise<boolean>;
  /** insert-or-update by a unique key */
  upsert: <T extends Row>(key: keyof HubData, values: Partial<T>, onConflict: string) => Promise<T | null>;
  remove: (key: keyof HubData, id: string) => Promise<boolean>;
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<T | null>;
  refresh: (key: keyof HubData) => Promise<void>;
};

const HubContext = createContext<Ctx | null>(null);
export const useHub = () => {
  const c = useContext(HubContext);
  if (!c) throw new Error("useHub outside provider");
  return c;
};

const SAVE_ERROR = "تعذر الحفظ — تحقق من الاتصال وحاول مرة ثانية";

export function HubProvider({
  initial,
  me,
  children,
}: {
  initial: HubData;
  me: Me;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, dispatch] = useReducer(reducer, initial);
  const [online, setOnline] = useState<Presence[]>([]);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tabRef = useRef("goals");
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const notify = useCallback((text: string, kind: Toast["kind"] = "error") => {
    const id = Date.now() + Math.random();
    // one toast per message at a time (a failed multi-row update must not stack N copies)
    setToasts((t) => (t.some((x) => x.text === text) ? t : [...t, { id, text, kind }]));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const refresh = useCallback(
    async (key: keyof HubData) => {
      if (key === "staff") {
        const { data: rows } = await supabase.rpc("staff_names");
        if (rows) dispatch({ type: "replace", key, rows });
        return;
      }
      let q = supabase.from(KEY_TO_TABLE[key]).select("*");
      if (key === "ideas" || key === "notes") q = q.eq("archived", false);
      if (key === "activity") q = q.order("created_at", { ascending: false }).limit(40);
      if (key === "comments") q = q.order("created_at", { ascending: false }).limit(1000);
      if (key === "metrics") q = q.order("week_start", { ascending: false }).limit(400);
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
      dispatch({ type: "upsert", key, row: payload.new as Row });
    };
    const ch = supabase.channel("mk-changes");
    (Object.keys(TABLE_TO_KEY) as TableKey[]).forEach((table) => {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, handler(TABLE_TO_KEY[table]));
    });
    let first = true;
    ch.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") {
        // on reconnect, catch anything missed (the first subscribe already has fresh server data)
        if (!first) (Object.keys(initial) as (keyof HubData)[]).forEach((k) => refresh(k));
        first = false;
      }
    });
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        notify(SAVE_ERROR);
        return null;
      }
      dispatch({ type: "upsert", key, row: row as Row });
      return row as T;
    },
    [supabase, notify],
  );

  const upsert = useCallback(
    async <T extends Row>(key: keyof HubData, values: Partial<T>, onConflict: string) => {
      const { data: row, error } = await supabase.from(KEY_TO_TABLE[key]).upsert(values as never, { onConflict }).select("*").single();
      if (error || !row) {
        console.error(error);
        notify(SAVE_ERROR);
        return null;
      }
      dispatch({ type: "upsert", key, row: row as Row });
      return row as T;
    },
    [supabase, notify],
  );

  const update = useCallback(
    async <T extends Row>(key: keyof HubData, id: string, values: Partial<T>) => {
      dispatch({ type: "patch", key, row: { id, ...values } as Row });
      const { error } = await supabase.from(KEY_TO_TABLE[key]).update(values as never).eq("id", id);
      if (error) {
        console.error(error);
        notify(SAVE_ERROR);
        refresh(key);
        return false;
      }
      return true;
    },
    [supabase, refresh, notify],
  );

  const remove = useCallback(
    async (key: keyof HubData, id: string) => {
      dispatch({ type: "remove", key, id });
      const { error } = await supabase.from(KEY_TO_TABLE[key]).delete().eq("id", id);
      if (error) {
        console.error(error);
        notify("تعذر الحذف — تحقق من الاتصال");
        refresh(key);
        return false;
      }
      return true;
    },
    [supabase, refresh, notify],
  );

  const rpc = useCallback(
    async <T,>(fn: string, args: Record<string, unknown>) => {
      const { data: result, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(error);
        notify(SAVE_ERROR);
        return null;
      }
      return result as T;
    },
    [supabase, notify],
  );

  const value = useMemo<Ctx>(
    () => ({ data, me, online, connected, toasts, notify, setTab, insert, update, upsert, remove, rpc, refresh }),
    [data, me, online, connected, toasts, notify, setTab, insert, update, upsert, remove, rpc, refresh],
  );

  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}
