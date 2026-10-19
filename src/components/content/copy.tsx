"use client"

import type { ElementType } from "react"
import { useCopy } from "@/lib/content"

/**
 * Editable text on the page: <Copy k="home.hero.title" as="h1">The open universe for AI makers</Copy>.
 * The children are the default; an admin can change the text from the site editor or in place.
 *
 * Round 9 lead stub. The CMS worker adds inline editing without changing these props.
 */
export function Copy({ k, children, as, className, multiline }: { k: string; children: string; as?: ElementType; className?: string; multiline?: boolean }) {
  const text = useCopy(k, children)
  const Tag = as ?? "span"
  void multiline
  return <Tag className={className}>{text}</Tag>
}
