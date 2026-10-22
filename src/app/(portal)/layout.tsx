import { getProfile, canAccessMarketing, canEvaluate, hasAccess } from "@/lib/auth";
import Shell from "@/components/shell";

export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const profile = await getProfile();
  return (
    <Shell
      profile={{ id: profile.id, full_name: profile.full_name, username: profile.username }}
      access={{
        attendance: hasAccess(profile, "attendance"),
        players: hasAccess(profile, "players"),
        drills: hasAccess(profile, "drills"),
        calendar: hasAccess(profile, "calendar"),
        development: canEvaluate(profile),
        marketing: canAccessMarketing(profile),
        analytics: profile.role === "owner",
        team: profile.role === "owner",
      }}
    >
      {children}
    </Shell>
  );
}
