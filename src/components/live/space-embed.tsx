"use client"

import { useState } from "react"
import { Maximize2Icon, PlayIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * A running Space inside Nexverse. Nothing loads until the visitor asks: Spaces can be heavy (GPU queues,
 * large bundles), so the page itself stays light. The app runs in a sandboxed iframe on its own origin.
 */
export function SpaceEmbed({ host, title, cover, className }: { host: string; title: string; cover: React.ReactNode; className?: string }) {
  const [on, setOn] = useState(false)
  const [tall, setTall] = useState(false)
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card", className)}>
      {on ? (
        <>
          <iframe
            src={host}
            title={title}
            sandbox="allow-scripts allow-same-origin allow-forms"
            allow="clipboard-write; fullscreen"
            referrerPolicy="no-referrer"
            className={cn("block w-full bg-white transition-[height] duration-300", tall ? "h-[88vh]" : "h-[70vh] min-h-[480px]")}
          />
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <span>Running in a sandbox. Some apps take a minute to wake up.</span>
            <button type="button" onClick={() => setTall((t) => !t)} className="inline-flex items-center gap-1 hover:text-foreground">
              <Maximize2Icon aria-hidden className="size-3.5" />
              {tall ? "Smaller" : "Taller"}
            </button>
          </div>
        </>
      ) : (
        <div className="relative flex h-72 items-center justify-center">
          <div className="absolute inset-0">{cover}</div>
          <div className="absolute inset-0 bg-background/40" />
          <button
            type="button"
            onClick={() => setOn(true)}
            className="pressable relative inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background shadow-lg transition-transform hover:scale-[1.02]"
          >
            <PlayIcon aria-hidden className="size-4 fill-current" />
            Load the app
          </button>
        </div>
      )}
    </div>
  )
}
