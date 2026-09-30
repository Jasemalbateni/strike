import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PageKey, Profile } from "@/lib/types";

/** Current user's profile (cached per request). Redirects to /login when signed out. */
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  // deleted or deactivated while signed in → clear the session, then show the message on the login page
  if (!data || !data.is_active) redirect("/auth/signout?reason=inactive");
  return data as Profile;
});

export function canAccessMarketing(p: Profile) {
  return p.is_active && (p.role === "owner" || p.marketing_access);
}

/** page access — mirrors SQL has_access() */
export function hasAccess(p: Profile, page: PageKey) {
  return p.is_active && (p.role === "owner" || (p.access ?? []).includes(page));
}

/** players register, subscriptions, guardian data — mirrors SQL can_manage_players() */
export function canManagePlayers(p: Profile) {
  return hasAccess(p, "players");
}

/** cancel / restore a training session — mirrors SQL can_manage_sessions() */
export function canManageSessions(p: Profile) {
  return p.is_active && ["owner", "branch_manager", "admin"].includes(p.role);
}

/** approve drills into the library — mirrors SQL can_approve_drills() */
export function canApproveDrills(p: Profile) {
  return p.is_active && (p.role === "owner" || p.role === "branch_manager");
}

/** send users without access back home */
export function requireAccess(p: Profile, page: PageKey) {
  if (!hasAccess(p, page)) redirect("/");
}

/** today's date in Kuwait as yyyy-MM-dd (the server runs in UTC) */
export function todayKW() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
