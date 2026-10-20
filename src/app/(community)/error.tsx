"use client"

import { useEffect } from "react"
import { LostInSpace } from "@/components/site/lost-in-space"

/** A page that failed while rendering: the same black hole as a missing page, with a way to try again. */
export default function CommunityError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return <LostInSpace kind="error" onRetry={retry} />
}
