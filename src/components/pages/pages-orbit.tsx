import { FileTextIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * A page at the centre with two moons circling it in opposite directions: the empty state of the page builder.
 * Adapted from HorizonX's "Orbiting Circles" loader, rebuilt in CSS with the site's tokens (no script, no
 * global styles). It stands still when the visitor asks for less motion.
 */
export function PagesOrbit({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative grid place-items-center", className)}>
      <span className="absolute inset-0 rounded-full border border-ion/15" />
      <span className="absolute inset-[18%] rounded-full border border-dashed border-ion/20" />
      <span className="absolute inset-0 animate-[spin_9s_linear_infinite] motion-reduce:animate-none">
        <span className="absolute top-0 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ion shadow-[0_0_10px_var(--ion)]" />
      </span>
      <span className="absolute inset-[18%] animate-[spin_6s_linear_infinite_reverse] motion-reduce:animate-none">
        <span className="absolute bottom-0 left-1/2 size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-gold shadow-[0_0_8px_var(--gold)]" />
      </span>
      <span className="grid size-10 place-items-center rounded-xl border border-ion/30 bg-background/80 text-ion">
        <FileTextIcon className="size-5" />
      </span>
    </div>
  )
}
