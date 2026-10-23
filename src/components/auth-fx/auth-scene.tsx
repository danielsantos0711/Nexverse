"use client"

import dynamic from "next/dynamic"
import Image from "next/image"
import { useState } from "react"
import { Lockup } from "@/components/brand"
import { cn } from "@/lib/utils"

// WebGL only runs in the browser, and only on the pages that show it.
const DustVortex = dynamic(() => import("./dust-vortex"), { ssr: false })

/**
 * The living half of the sign-in screens: HorizonX's Dust Vortex drifting around a dark hollow, with the
 * official lockup over it. A still photograph shows first and stays when WebGL is missing; the shader fades
 * in over it once its first frame is drawn, pauses offscreen and holds still under reduced motion.
 */
export function AuthScene({ caption, className }: { caption: string; className?: string }) {
  const [drawn, setDrawn] = useState(false)
  return (
    <div className={cn("relative isolate overflow-hidden rounded-3xl border border-border bg-background", className)}>
      {/* The poster sits in its own box: the panel itself may be sticky, which next/image's fill does not accept as a parent. */}
      <span aria-hidden className="absolute inset-0 -z-20">
        <Image src="/space/deep-field.webp" alt="" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover opacity-40" />
      </span>
      <div aria-hidden className={cn("absolute inset-0 -z-10 transition-opacity duration-1000 ease-out motion-reduce:transition-none", drawn ? "opacity-100" : "opacity-0")}>
        <DustVortex onReady={() => setDrawn(true)} />
      </div>
      {/* Keeps the lockup and the caption readable over the brightest dust. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_70%_at_0%_0%,rgb(5_6_10/0.85),transparent_55%),linear-gradient(to_top,rgb(5_6_10/0.9),transparent_40%)]" />
      <div className="flex h-full flex-col justify-between gap-10 p-6 md:p-8">
        <Lockup size="lg" alt="Nexverse" className="max-sm:[--nh:27px]!" />
        <p className="max-w-[36ch] text-sm text-pretty text-white/80 max-sm:sr-only md:text-base">{caption}</p>
      </div>
    </div>
  )
}
