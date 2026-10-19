import type { Metadata } from "next"
import { AiPanel } from "@/components/admin/ai-panel"

export const metadata: Metadata = { title: "AI" }

export default function AdminAiPage() {
  return <AiPanel />
}
