import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

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
