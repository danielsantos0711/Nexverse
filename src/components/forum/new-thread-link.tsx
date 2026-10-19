"use client"

import Link from "next/link"
import { SquarePenIcon } from "lucide-react"
import { primaryButton } from "@/components/forum/forum-ui"
import { findCategory, postBlockText, useForumMap, usePostBlock } from "@/lib/forum-categories"

/**
 * "New thread" for a category page. When the category's rules keep you from starting one (archived, team only,
 * not enough reputation) the button gives way to the reason. Guests keep the button: the form asks them to sign in.
 */
export function NewThreadLink({ category }: { category: string }) {
  const map = useForumMap()
  const c = findCategory(map, category)
  const { ready, block, signedIn } = usePostBlock(c)
  if (c && ready && block && (signedIn || block === "archived" || block === "staff")) {
    return <span className="max-w-xs text-xs text-muted-foreground">{postBlockText(block, c)}</span>
  }
  return (
    <Link href={`/forum/new?c=${category}`} className={primaryButton}>
      <SquarePenIcon aria-hidden className="size-4" /> New thread
    </Link>
  )
}
