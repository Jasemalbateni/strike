"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import { useHub } from "./store";
import { Avatar } from "@/components/ui";

const ACTION: Record<string, string> = { created: "أضاف", updated: "عدّل", deleted: "حذف", moved: "نقل" };
const ENTITY: Record<string, string> = { goal: "هدف", plan: "عنصر خطة", idea: "فكرة", post: "منشور", metric: "أرقام" };

export default function ActivityDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useHub();
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-navy-900/40" onClick={onClose} />
      <aside className="absolute inset-y-0 start-0 w-full max-w-sm bg-white shadow-[var(--shadow-pop)] flex flex-col fade-up">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-silver-200">
          <h2 className="text-navy font-extrabold text-[18px]">سجل النشاط</h2>
          <button onClick={onClose} className="p-2 -me-2 rounded-lg text-ink-2 hover:bg-silver-100" aria-label="إغلاق">
            <X size={20} />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1">
          {data.activity.length === 0 && <li className="text-ink-2 text-sm p-4 text-center">لا يوجد نشاط بعد</li>}
          {data.activity.map((a) => (
            <li key={a.id} className="flex gap-3 rounded-xl px-2 py-2.5 hover:bg-silver-100">
              <Avatar name={a.actor_name || "؟"} size={30} tone="ice" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] text-navy leading-snug">
                  <span className="font-bold">{a.actor_name || "مستخدم"}</span> {ACTION[a.action] ?? a.action} {ENTITY[a.entity] ?? a.entity}
                  {a.summary && <span className="font-bold"> «{a.summary}»</span>}
                </div>
                <div className="text-ink-2 text-xs mt-0.5">
                  قبل {formatDistanceToNowStrict(new Date(a.created_at), { locale: ar })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>,
    document.body,
  );
}
