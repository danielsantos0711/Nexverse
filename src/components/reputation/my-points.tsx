"use client"

import { PointsHistory } from "@/components/reputation/points-history"
import { useSession } from "@/lib/store"

/** Your points history, for /you. Nothing for guests (the page itself asks them to sign in). */
export function MyPoints({ className }: { className?: string }) {
  const { ready, user } = useSession()
  if (!ready || !user) return null
  return <PointsHistory memberId={user.id} self className={className} />
}
