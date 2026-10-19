import Link from "next/link"
import { OrbitIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * "See in Cosmos": a small button any page can place next to a resource, person, category or project. It opens the
 * star map already flown to that star. `target` is the star's key, e.g. "model:orbit-8b", "person:ines",
 * "category:help" or "project:<uuid>". Works in server and client components.
 */
export function CosmosLink({ target, label = "See in Cosmos", className }: { target: string; label?: string; className?: string }) {
  return (
    <Link
      href={`/cosmos?focus=${encodeURIComponent(target).replace(/%3A/gi, ":")}`}
      className={cn(
        "pressable inline-flex h-8 items-center gap-1.5 rounded-full border border-ion/25 bg-ion/10 px-3 text-xs font-medium text-ion transition-colors hover:border-ion/45 hover:bg-ion/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
    >
      <OrbitIcon aria-hidden className="size-3.5" />
      {label}
    </Link>
  )
}
