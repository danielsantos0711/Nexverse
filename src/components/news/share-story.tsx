"use client"

import { toast } from "@/components/site/toaster"
import { useState } from "react"
import { CheckIcon, Share2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Share a story: the system share sheet where there is one, otherwise the link is copied. */
export function ShareStory({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false)
  async function share() {
    const url = new URL(path, window.location.origin).toString()
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast("Link copied. Paste it anywhere.")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The reader closed the share sheet, or the clipboard is not available: nothing to report.
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={share}>
      {copied ? <CheckIcon aria-hidden /> : <Share2Icon aria-hidden />}
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </Button>
  )
}
