import { getProfile, canAccessMarketing, canManagePlayers } from "@/lib/auth";
import Shell from "@/components/shell";

export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const profile = await getProfile();
  return (
    <Shell
      profile={{ full_name: profile.full_name, username: profile.username }}
      showMarketing={canAccessMarketing(profile)}
      isOwner={profile.role === "owner"}
      canManagePlayers={canManagePlayers(profile)}
    >
      {children}
    </Shell>
  );
}
