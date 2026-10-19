import Image from "next/image"
import { cn } from "@/lib/utils"

/*
 * The official artwork. Every size below keeps the file's own proportions (horizontal-white.png is
 * 1600 × 328), so the lockup is only ever scaled uniformly: never stretched, squashed or cropped.
 */
const LOCKUP = { w: 1600, h: 328 } as const

/** Rendered widths in CSS pixels; the height follows from the artwork's ratio (shown for reference). */
export const LOCKUP_SIZES = {
  /** Mobile header and the menu sheet: 144 × 29.5 */
  sm: 144,
  /** Desktop header: 172 × 35.3 */
  md: 172,
  /** Footer and sign-in screens: 232 × 47.6 */
  lg: 232,
} as const
export type LockupSize = keyof typeof LOCKUP_SIZES

/** The horizontal NEXVERSE lockup (the N and the wordmark) in white, for the dark ground. */
export function Lockup({ size = "md", className, priority = false, alt = "Nexverse" }: { size?: LockupSize; className?: string; priority?: boolean; alt?: string }) {
  const width = LOCKUP_SIZES[size]
  return (
    <Image
      src="/brand/horizontal-white.png"
      alt={alt}
      width={LOCKUP.w}
      height={LOCKUP.h}
      sizes={`${width}px`}
      priority={priority}
      // width is fixed and height is auto, so the box always has the artwork's exact aspect ratio
      style={{ width, height: "auto", aspectRatio: `${LOCKUP.w} / ${LOCKUP.h}` }}
      className={cn("block max-w-none shrink-0 object-contain select-none", className)}
      draggable={false}
    />
  )
}

export type Material = "chrome" | "titanium" | "champagne"

/** The fluid N in one of its material studies, as a still image. The files are square, so any square box shows it whole. */
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
    <span className={cn("relative block aspect-square overflow-hidden", className)}>
      <Image src={`/brand/n-${material}${small ? "-sm" : ""}.webp`} alt="" fill sizes={sizes} priority={priority} className="object-contain" />
    </span>
  )
}
