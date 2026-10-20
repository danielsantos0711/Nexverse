"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { useQuality } from "@/lib/perf"
import type { ResourceKind } from "@/lib/data"

/*
 * HorizonX "Pixel Card" on a hub card: a field of pixels in the colours of the item's kind spreads from where
 * the pointer came in. Nothing is drawn, and no canvas exists, until the card is first pointed at or focused,
 * so a long list stays light. Off at the low quality tiers. The card must be `relative` and clip its corners.
 */

const Layer = dynamic(() => import("./fx/pixel-glint"), { ssr: false })

const COLORS: Record<ResourceKind | "collection" | "news", string> = {
  model: "#a9c2ff,#c9d9ff,#5f7fd1",
  dataset: "#9fe3cf,#c6f1e4,#4f9e88",
  tool: "#e9c79a,#f3e3bd,#a8834f",
  repo: "#d3b4ff,#e7d8ff,#8a6bc4",
  collection: "#8fb4ff,#d8c59e,#c9d9ff",
  news: "#d8c59e,#f3e3bd,#8fb4ff",
}

export function PixelGlint({ kind }: { kind: ResourceKind | "collection" | "news" }) {
  const quality = useQuality()
  const marker = useRef<HTMLSpanElement>(null)
  const [origin, setOrigin] = useState<{ ox: number; oy: number } | null>(null)
  const allowed = quality === "high" || quality === "medium"

  useEffect(() => {
    const card = marker.current?.parentElement
    if (!card || !allowed || origin || matchMedia("(hover: none)").matches) return
    const wake = (e: Event) => {
      const box = card.getBoundingClientRect()
      const p = e as PointerEvent
      const ox = "clientX" in p && box.width ? (p.clientX - box.left) / box.width : 0.5
      const oy = "clientY" in p && box.height ? (p.clientY - box.top) / box.height : 0.5
      setOrigin({ ox, oy })
    }
    card.addEventListener("pointerenter", wake, { once: true })
    card.addEventListener("focusin", wake, { once: true })
    return () => {
      card.removeEventListener("pointerenter", wake)
      card.removeEventListener("focusin", wake)
    }
  }, [allowed, origin])

  if (!allowed) return null
  if (!origin) return <span ref={marker} hidden />
  return <Layer colors={COLORS[kind]} ox={origin.ox} oy={origin.oy} gap={7} />
}
