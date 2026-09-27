"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, AtSign } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import { useHub } from "./store";
import { CommentBody } from "./comments";
import { Avatar, PlatformChip } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { Post } from "@/lib/types";

/** comments that mention me, newest first */
export function useMyMentions() {
  const { data, me } = useHub();
  return useMemo(
    () =>
      data.comments
        .filter((c) => c.mentions.includes(me.id) && c.author_id !== me.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [data.comments, me.id],
  );
}

export default function MentionsDrawer({
  open,
  onClose,
  onOpenPost,
  seenAt,
  onSeen,
}: {
  open: boolean;
  onClose: () => void;
  onOpenPost: (p: Post) => void;
  seenAt: string;
  onSeen: (iso: string) => void;
}) {
  const { data, me } = useHub();
  const mentions = useMyMentions();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // opening the drawer marks everything as seen
    const now = new Date().toISOString();
    onSeen(now);
    createClient()
      .from("profiles")
      .update({ mentions_seen_at: now })
      .eq("id", me.id)
      .then(() => {});
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-navy-900/40" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="الإشارات"
        className="absolute inset-y-0 start-0 w-full max-w-sm bg-white shadow-[var(--shadow-pop)] flex flex-col fade-up"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-silver-200">
          <h2 className="text-navy font-extrabold text-[18px] flex items-center gap-2">
            <AtSign size={18} className="text-ice" /> الإشارات لك
          </h2>
          <button
            onClick={onClose}
            className="h-11 w-11 -me-3 grid place-items-center rounded-lg text-ink-2 hover:bg-silver-100"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1.5">
          {mentions.length === 0 && (
            <li className="text-ink-2 text-sm p-4 text-center">
              ما أحد أشار لك بعد
            </li>
          )}
          {mentions.map((c) => {
            const post = data.posts.find((p) => p.id === c.post_id);
            const fresh = c.created_at > seenAt;
            return (
              <li key={c.id}>
                <button
                  onClick={() => {
                    if (post) {
                      onClose();
                      onOpenPost(post);
                    }
                  }}
                  className={`w-full text-start rounded-xl border px-3 py-2.5 hover:border-ice transition ${fresh ? "border-ice bg-ice-50" : "border-silver-200 bg-white"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar
                      name={c.author_name || "؟"}
                      size={24}
                      tone="light"
                    />
                    <span className="text-navy font-bold text-[13px]">
                      {c.author_name}
                    </span>
                    <span className="text-ink-2 text-[11px]">
                      قبل{" "}
                      {formatDistanceToNowStrict(new Date(c.created_at), {
                        locale: ar,
                      })}
                    </span>
                  </div>
                  <CommentBody
                    body={c.body}
                    staff={data.staff}
                    className="text-[13.5px] text-navy"
                  />
                  {post ? (
                    <div className="mt-1.5 flex items-center gap-1.5 text-ink-2 text-xs">
                      <PlatformChip platform={post.platform} />{" "}
                      <span className="truncate">{post.title}</span>
                    </div>
                  ) : (
                    <div className="mt-1.5 text-ink-2 text-xs">
                      المنشور محذوف
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>,
    document.body,
  );
}
