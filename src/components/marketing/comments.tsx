"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Send, Trash2, AtSign } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import clsx from "clsx";
import { useHub } from "./store";
import { useConfirm } from "@/components/confirm";
import { Avatar } from "@/components/ui";
import type { Comment, StaffName } from "@/lib/types";

/** Render a comment body with @mentions highlighted (matches "@الاسم الكامل" against the staff list). */
export function CommentBody({
  body,
  staff,
  className,
}: {
  body: string;
  staff: StaffName[];
  className?: string;
}) {
  const names = useMemo(
    () => [...staff].sort((a, b) => b.full_name.length - a.full_name.length),
    [staff],
  );
  const parts: { text: string; mention: boolean }[] = [];
  let rest = body;
  while (rest.length) {
    const at = rest.indexOf("@");
    if (at === -1) {
      parts.push({ text: rest, mention: false });
      break;
    }
    if (at > 0) parts.push({ text: rest.slice(0, at), mention: false });
    const after = rest.slice(at + 1);
    const hit = names.find((s) => after.startsWith(s.full_name));
    if (hit) {
      parts.push({ text: "@" + hit.full_name, mention: true });
      rest = after.slice(hit.full_name.length);
    } else {
      parts.push({ text: "@", mention: false });
      rest = after;
    }
  }
  return (
    <span className={clsx("whitespace-pre-wrap break-words", className)}>
      {parts.map((p, i) =>
        p.mention ? (
          <span
            key={i}
            className="rounded-md bg-ice-100 text-navy font-bold px-1"
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

export default function Comments({ postId }: { postId: string }) {
  const { data, me, insert, remove } = useHub();
  const confirm = useConfirm();
  const comments = useMemo(
    () => data.comments.filter((c) => c.post_id === postId),
    [data.comments, postId],
  );
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ query: string; at: number } | null>(null);
  const [menuIdx, setMenuIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listEnd = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    if (!menu) return [];
    const q = menu.query.toLowerCase();
    return data.staff
      .filter(
        (s) =>
          s.id !== me.id &&
          (!q ||
            s.full_name.toLowerCase().includes(q) ||
            s.username.includes(q)),
      )
      .slice(0, 6);
  }, [menu, data.staff, me.id]);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "nearest" });
  }, [comments.length]);

  function onChange(v: string) {
    setText(v);
    const caret = inputRef.current?.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = /(?:^|\s)@([^\s@]*)$/.exec(before);
    if (m) {
      setMenu({ query: m[1], at: caret - m[1].length - 1 });
      setMenuIdx(0);
    } else setMenu(null);
  }

  function pick(s: StaffName) {
    if (!menu) return;
    const caret = inputRef.current?.selectionStart ?? text.length;
    const next =
      text.slice(0, menu.at) + "@" + s.full_name + " " + text.slice(caret);
    setText(next);
    setMenu(null);
    requestAnimationFrame(() => {
      const pos = menu.at + s.full_name.length + 2;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (menu && suggestions.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenuIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenuIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(suggestions[menuIdx]);
        return;
      }
      if (e.key === "Escape") {
        setMenu(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const mentions = data.staff
      .filter((s) => body.includes("@" + s.full_name))
      .map((s) => s.id);
    const row = await insert<Comment>("comments", {
      post_id: postId,
      body,
      mentions,
    });
    setBusy(false);
    if (row) setText("");
  }

  return (
    <div className="sm:col-span-3 pt-3 border-t border-silver-200">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-navy font-extrabold text-[15px]">التعليقات</span>
        <span className="num text-ink-2 text-sm font-bold">
          {comments.length}
        </span>
        <span className="text-ink-2 text-xs ms-auto flex items-center gap-1">
          <AtSign size={12} /> اكتب @ للإشارة لزميل
        </span>
      </div>

      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pe-1">
        {comments.length === 0 && (
          <p className="text-ink-2 text-sm py-2">
            لا توجد تعليقات بعد — ابدأ النقاش هنا.
          </p>
        )}
        {comments.map((c) => {
          const mine = c.author_id === me.id;
          return (
            <div
              key={c.id}
              className={clsx("group flex gap-2.5", mine && "flex-row-reverse")}
            >
              <Avatar
                name={c.author_name || "؟"}
                size={30}
                tone={mine ? "ice" : "light"}
                className="mt-0.5"
              />
              <div
                className={clsx(
                  "min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2",
                  mine
                    ? "bg-ice-50 rounded-te-md"
                    : "bg-silver-100 rounded-ts-md",
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-navy font-bold text-[13px]">
                    {c.author_name || "مستخدم"}
                  </span>
                  <span className="text-ink-2 text-[11px]">
                    قبل{" "}
                    {formatDistanceToNowStrict(new Date(c.created_at), {
                      locale: ar,
                    })}
                  </span>
                  {(mine || me.isOwner) && (
                    <button
                      onClick={async () =>
                        (await confirm({ title: "حذف التعليق؟" })) &&
                        remove("comments", c.id)
                      }
                      className="reveal ms-auto -me-1 h-7 w-7 grid place-items-center rounded-md text-ink-2 hover:text-error hover:bg-error-100"
                      aria-label="حذف التعليق"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <CommentBody
                  body={c.body}
                  staff={data.staff}
                  className="text-[14px] text-navy leading-relaxed"
                />
              </div>
            </div>
          );
        })}
        <div ref={listEnd} />
      </div>

      <div className="relative mt-3">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => setTimeout(() => setMenu(null), 150)}
          rows={2}
          placeholder="اكتب تعليقاً… Enter للإرسال، Shift+Enter لسطر جديد"
          className="field min-h-[56px] pe-12 resize-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || busy}
          className="absolute end-2 bottom-2 h-9 w-9 grid place-items-center rounded-lg bg-navy text-white disabled:opacity-40"
          aria-label="إرسال"
        >
          <Send size={16} className="-scale-x-100" />
        </button>

        {menu && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute z-10 bottom-full mb-1 start-0 w-64 max-w-full card p-1 fade-up"
          >
            {suggestions.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === menuIdx}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                  className={clsx(
                    "w-full flex items-center gap-2 rounded-lg px-2 h-10 text-start",
                    i === menuIdx ? "bg-navy-50" : "hover:bg-silver-100",
                  )}
                >
                  <Avatar name={s.full_name} size={24} tone="light" />
                  <span className="font-bold text-navy text-sm flex-1 truncate">
                    {s.full_name}
                  </span>
                  <span className="en text-ink-2 text-xs" dir="ltr">
                    @{s.username}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
