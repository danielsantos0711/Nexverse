import Link from "next/link"
import { MessageSquarePlusIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

/**
 * "Discuss this" on anything: opens a new forum topic already titled and linked to the thing,
 * in the category that fits it, so a conversation is one click away from every page.
 */
export function DiscussButton({
  title,
  href,
  category = "show",
  className,
}: {
  /** What is being discussed, shown in the topic title. */
  title: string
  /** The Nexverse page of the thing; it goes into the first post as a link. */
  href: string
  category?: string
  className?: string
}) {
  const params = new URLSearchParams({
    title: `Discussing ${title}`.slice(0, 300),
    body: `What do you think of [${title}](${href})?\n\n`,
    c: category,
  })
  return (
    <Link
      href={`/forum/new?${params}`}
      className={cn(
        "pressable inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 text-sm text-foreground/90 transition-colors hover:border-white/25 hover:bg-white/[0.07]",
        className,
      )}
    >
      <MessageSquarePlusIcon aria-hidden className="size-3.5" />
      <Copy k="common.discuss-button.discuss-this">Discuss this</Copy>
    </Link>
  )
}
