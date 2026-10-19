import { cn } from "@/lib/utils"

/**
 * Where another part of Nexverse drops into the home page (launch of the day, who is online, missions,
 * duels). With its component placed as the child it renders just that; until then it shows a labelled outline
 * in development and nothing in production, so a missing piece never looks broken to visitors.
 */
export function Slot({ name, children, className }: { name: string; children?: React.ReactNode; className?: string }) {
  if (children) return <>{children}</>
  if (process.env.NODE_ENV === "production") return null
  return (
    <div aria-hidden className={cn("slot-outline grid min-h-40 place-items-center rounded-2xl p-6 text-center text-sm text-ion/80", className)}>
      {name} goes here
    </div>
  )
}
