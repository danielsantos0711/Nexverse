import Image from "next/image"
import { cn } from "@/lib/utils"

/** The horizontal NEXVERSE lockup in white, for the dark ground. */
export function Lockup({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block h-[19px] w-[132px]", className)}>
      <Image src="/brand/horizontal-white.png" alt="Nexverse" fill sizes="160px" priority className="object-contain object-left" />
    </span>
  )
}

export type Material = "chrome" | "titanium" | "champagne"

/** The fluid N in one of its material studies, as a still image. */
export function NMark({
  material = "chrome",
  className,
  sizes = "240px",
  small = false,
  priority = false,
}: {
  material?: Material
  className?: string
  sizes?: string
  small?: boolean
  priority?: boolean
}) {
  return (
    <span className={cn("relative block overflow-hidden", className)}>
      <Image src={`/brand/n-${material}${small ? "-sm" : ""}.webp`} alt="" fill sizes={sizes} priority={priority} className="object-cover" />
    </span>
  )
}
