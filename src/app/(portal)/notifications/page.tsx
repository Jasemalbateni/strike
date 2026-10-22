import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/page-header";
import NotificationsCenter, { type Recipient } from "./notifications-center";
import type { Notification } from "@/lib/notifications";

export const metadata: Metadata = { title: "التنبيهات" };

export default async function NotificationsPage() {
  const me = await getProfile();
  const isOwner = me.role === "owner";
  const supabase = await createClient();

  const [mine, staff, sent] = await Promise.all([
    supabase.from("notifications").select("*").eq("recipient_id", me.id).neq("channel", "whatsapp").order("created_at", { ascending: false }).limit(100),
    isOwner ? supabase.from("profiles").select("id, full_name, username, phone, role").eq("is_active", true).order("created_at") : Promise.resolve({ data: [] }),
    isOwner ? supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(150) : Promise.resolve({ data: [] }),
  ]);

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-5xl">
      <PageHeader title="التنبيهات" subtitle={isOwner ? "أرسل تنبيه لمدرب أو أكثر — على الموقع أو الواتساب أو الاثنين" : "التنبيهات اللي توصلك من إدارة الأكاديمية"} />
      <NotificationsCenter
        meId={me.id}
        isOwner={isOwner}
        initialMine={(mine.data ?? []) as Notification[]}
        staff={((staff.data ?? []) as Recipient[]).filter((p) => p.id !== me.id)}
        initialSent={((sent.data ?? []) as Notification[]).filter((n) => n.recipient_id !== me.id || n.sender_id !== me.id)}
      />
    </div>
  );
}
