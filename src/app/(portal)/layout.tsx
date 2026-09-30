import { getProfile, canAccessMarketing, hasAccess } from "@/lib/auth";
import Shell from "@/components/shell";

export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const profile = await getProfile();
  return (
    <Shell
      profile={{ full_name: profile.full_name, username: profile.username }}
      access={{
        attendance: hasAccess(profile, "attendance"),
        players: hasAccess(profile, "players"),
        drills: hasAccess(profile, "drills"),
        calendar: hasAccess(profile, "calendar"),
        marketing: canAccessMarketing(profile),
        team: profile.role === "owner",
      }}
    >
      {children}
    </Shell>
  );
}
