import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { SETTING_SECTIONS, isSettingSection } from "@/components/admin/sections"
import { SettingsSection } from "@/components/admin/settings-forms"
import { Skeleton } from "@/components/ui/skeleton"

export function generateStaticParams() {
  return SETTING_SECTIONS.map((s) => ({ section: s.key }))
}

export async function generateMetadata({ params }: PageProps<"/admin/settings/[section]">): Promise<Metadata> {
  const { section } = await params
  return { title: SETTING_SECTIONS.find((s) => s.key === section)?.label ?? "Site settings" }
}

export default function AdminSettingsSectionPage({ params }: PageProps<"/admin/settings/[section]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Section params={params} />
    </Suspense>
  )
}

async function Section({ params }: { params: PageProps<"/admin/settings/[section]">["params"] }) {
  const { section } = await params
  if (!isSettingSection(section)) notFound()
  return <SettingsSection section={section} />
}
