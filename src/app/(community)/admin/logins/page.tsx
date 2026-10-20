import type { Metadata } from "next"
import { LoginsGuide } from "@/components/admin/logins-guide"

export const metadata: Metadata = { title: "Sign-in methods" }

export default function AdminLoginsPage() {
  return <LoginsGuide />
}
