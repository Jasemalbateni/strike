import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import ResourceEditor from "@/components/resources/editor";

export const metadata: Metadata = { title: "موضوع جديد" };

export default async function NewResourcePage({ searchParams }: PageProps<"/resources/new">) {
  const me = await getProfile();
  if (me.role !== "owner") redirect("/resources");
  const { kind } = await searchParams;
  return <ResourceEditor initialKind={kind === "presentation" ? "presentation" : "article"} />;
}
