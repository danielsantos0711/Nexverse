"use client"

import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {}
      }}
      className="pressable inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-white/5 hover:text-foreground"
    >
      {done ? <CheckIcon aria-hidden className="size-3.5 text-ok" /> : <CopyIcon aria-hidden className="size-3.5" />}
      {done ? "Copied" : "Copy"}
    </button>
  )
}
