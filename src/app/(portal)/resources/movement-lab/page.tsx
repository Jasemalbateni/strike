import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getProfile } from "@/lib/auth";
import PageHeader from "@/components/page-header";
import MovementLab from "@/components/resources/movement-lab/movement-lab";
import { bidi } from "@/lib/bidi";

export const metadata: Metadata = { title: "المختبر الحركي" };

export default async function MovementLabPage() {
  await getProfile();
  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl">
      <Link href="/resources" className="inline-flex items-center gap-1 text-ink-2 hover:text-navy text-[14px] font-bold mb-3">
        <ChevronRight size={16} /> المصادر التعليمية
      </Link>
      <PageHeader title="المختبر الحركي" subtitle={bidi("الجانب البدني للاعب الصغير · فئة 5–8")} />
      <MovementLab />
    </div>
  );
}
