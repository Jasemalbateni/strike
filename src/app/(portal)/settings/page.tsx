import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import PageHeader from "@/components/page-header";
import SettingsForm from "./settings-form";

export const metadata: Metadata = { title: "الإعدادات" };

export default async function SettingsPage() {
  const profile = await getProfile();
  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-2xl">
      <PageHeader title="الإعدادات" subtitle="حسابك وكلمة المرور" />
      <SettingsForm fullName={profile.full_name} username={profile.username} />
    </div>
  );
}
