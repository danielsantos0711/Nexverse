"use client"

import { useState } from "react"
import { ImageIcon, Loader2Icon, XIcon } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { Attachment } from "@/lib/chat"
import { altFromName, imageProblem, uploadImage } from "@/lib/editor/media"
import { cn } from "@/lib/utils"

/** Pictures in a message: one large, or a tidy grid of up to four. Tap one to see it full size. */
export function Attachments({ list, className }: { list: Attachment[]; className?: string }) {
  const [open, setOpen] = useState<Attachment | null>(null)
  if (!list.length) return null
  const single = list.length === 1
  return (
    <>
      <ul className={cn("mt-1.5 grid max-w-md gap-1.5", single ? "grid-cols-1" : "grid-cols-2", className)} aria-label="Pictures">
        {list.map((a) => (
          <li key={a.url}>
            <button
              type="button"
              onClick={() => setOpen(a)}
              className="group/pic block w-full overflow-hidden rounded-lg border border-border bg-black/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Open picture: ${a.alt}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- member uploads from storage, any size */}
              <img
                src={a.url}
                alt={a.alt}
                loading="lazy"
                decoding="async"
                width={a.w}
                height={a.h}
                className={cn("w-full object-cover transition-transform duration-300 group-hover/pic:scale-[1.02] motion-reduce:transform-none", single ? "max-h-80" : "aspect-square")}
              />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-[min(64rem,calc(100vw-2rem))] gap-2 p-2 sm:max-w-[min(64rem,calc(100vw-2rem))]">
          <DialogTitle className="sr-only">{open?.alt ?? "Picture"}</DialogTitle>
          {open && (
            // eslint-disable-next-line @next/next/no-img-element -- member uploads from storage, any size
            <img src={open.url} alt={open.alt} className="max-h-[80dvh] w-full rounded-lg object-contain" />
          )}
          {open?.alt && <p className="px-2 pb-1 text-sm text-muted-foreground">{open.alt}</p>}
        </DialogContent>
      </Dialog>
    </>
  )
}

export type Pending = { key: string; name: string; preview: string; status: "uploading" | "ready" | "failed"; attachment?: Attachment; error?: string }

/** Measures a picture once it is uploaded, so the message keeps its shape while it loads for everyone else. */
function measure(url: string): Promise<{ w?: number; h?: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({})
    img.src = url
  })
}

/** Uploads pictures for the message box, at most four, and keeps their state for the strip above it. */
export async function uploadPictures(files: File[], have: number, update: (fn: (list: Pending[]) => Pending[]) => void) {
  const room = Math.max(0, 4 - have)
  for (const file of files.slice(0, room)) {
    const key = crypto.randomUUID()
    const problem = imageProblem(file)
    const preview = URL.createObjectURL(file)
    update((l) => [...l, { key, name: file.name, preview, status: problem ? "failed" : "uploading", error: problem ?? undefined }])
    if (problem) continue
    uploadImage(file)
      .then(async (url) => {
        const size = await measure(url)
        update((l) => l.map((p) => (p.key === key ? { ...p, status: "ready", attachment: { url, alt: altFromName(file.name), ...size } } : p)))
      })
      .catch((e: Error) => update((l) => l.map((p) => (p.key === key ? { ...p, status: "failed", error: e.message } : p))))
  }
}

/** The pictures waiting to be sent, above the message box. */
export function PendingStrip({ list, onRemove }: { list: Pending[]; onRemove: (key: string) => void }) {
  if (!list.length) return null
  return (
    <ul className="flex gap-2 overflow-x-auto px-1 pb-1.5" aria-label="Pictures to send">
      {list.map((p) => (
        <li key={p.key} className="relative shrink-0" title={p.error ?? p.name}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
          <img src={p.preview} alt="" className={cn("size-16 rounded-lg border object-cover", p.status === "failed" ? "border-destructive/60 opacity-50" : "border-border")} />
          {p.status === "uploading" && (
            <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/50">
              <Loader2Icon aria-label="Uploading" className="size-4 animate-spin" />
            </span>
          )}
          {p.status === "failed" && (
            <span className="absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-destructive/80 px-1 text-[10px] text-white">
              <ImageIcon aria-hidden className="mr-0.5 inline size-2.5" /> Failed
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(p.key)}
            aria-label={`Remove ${p.name}`}
            className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-background text-muted-foreground ring-1 ring-border hover:text-foreground"
          >
            <XIcon aria-hidden className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  )
}
