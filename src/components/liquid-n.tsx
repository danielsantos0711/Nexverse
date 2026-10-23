import { cn } from "@/lib/utils"

/*
 * Daniel's N in polished metal (round 12c). The picture is his own chrome N (n-metal.webp: n-chrome-alpha.webp
 * cropped to the N, pixels untouched), so the shape and the depth of its shading are exactly his. The "liquid" is
 * light only: a slow wash of reflection that flows across the metal and a bright sweep, both masked by the same file,
 * so nothing ever changes the outline. A WebGL relief was tried and dropped: on Safari it rounded the N into a flat
 * blob. Reduced motion and the low/off tiers keep the still metal (brand.css).
 */
export function LiquidN({ className, style, big = false }: { className?: string; style?: React.CSSProperties; big?: boolean; priority?: boolean }) {
  const src = big ? "/brand/n-metal.webp" : "/brand/n-metal-512.webp"
  return (
    <span className={cn("nx-metal relative block shrink-0", className)} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the same file is the mask of the light layers, served as is */}
      <img src={src} alt="" draggable={false} className="absolute inset-0 size-full object-contain" />
      <span aria-hidden className="nx-metal-light" style={{ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` }} />
    </span>
  )
}
