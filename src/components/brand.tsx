import Image from "next/image"
import { cn } from "@/lib/utils"
import type { Material } from "@/lib/data"

/** The horizontal NEXVERSE lockup; swaps to the dark-ink version on the pearl theme. */
export function Lockup({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block h-[18px] w-[124px]", className)}>
      <Image
        src="/brand/horizontal-white.png"
        alt="Nexverse"
        fill
        sizes="160px"
        priority
        className="theme-img-dark object-contain object-left"
      />
      <Image
        src="/brand/horizontal-dark.png"
        alt="Nexverse"
        fill
        sizes="160px"
        priority
        className="theme-img-light object-contain object-left"
      />
    </span>
  )
}

/**
 * The N in one of its material studies. Pearl replaces the dark materials on the light theme so the
 * symbol always sits on a ground that matches its own.
 */
export function NMark({
  material = "chrome",
  className,
  sizes = "240px",
  small = false,
  priority = false,
  fit = "cover",
}: {
  material?: Material
  className?: string
  sizes?: string
  small?: boolean
  priority?: boolean
  fit?: "cover" | "contain"
}) {
  const suffix = small ? "-sm" : ""
  const dark = material === "pearl" ? "chrome" : material
  return (
    <span className={cn("relative block overflow-hidden", className)}>
      <Image
        src={`/brand/n-${dark}${suffix}.webp`}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        className={cn("theme-img-dark", fit === "cover" ? "object-cover" : "object-contain")}
      />
      <Image
        src={`/brand/n-pearl${suffix}.webp`}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        className={cn("theme-img-light", fit === "cover" ? "object-cover" : "object-contain")}
      />
    </span>
  )
}
