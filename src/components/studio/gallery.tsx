"use client"

import { useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, ImagesIcon } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { GalleryItem } from "@/lib/projects"

/** A project's pictures: a grid of thumbnails that opens a viewer with arrows and captions. */
export function Gallery({ items, name }: { items: GalleryItem[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const go = (d: number) => setOpen((i) => (i === null ? i : (i + d + items.length) % items.length))
  const cur = open === null ? null : items[open]
  return (
    <section aria-labelledby="gallery-h" className="flex flex-col gap-3">
      <h2 id="gallery-h" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <ImagesIcon aria-hidden className="size-4" /> Gallery
      </h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {items.map((g, i) => (
          <li key={g.url}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group block w-full overflow-hidden rounded-xl border border-border bg-black/30 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="block aspect-video overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- member picture */}
                <img src={g.url} alt={g.caption || `${name}, picture ${i + 1}`} loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none" />
              </span>
              {g.caption && <span className="block truncate px-2.5 py-1.5 text-xs text-muted-foreground">{g.caption}</span>}
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-5xl">
          <DialogTitle className="sr-only">
            {name}, picture {(open ?? 0) + 1} of {items.length}
          </DialogTitle>
          {cur && (
            <div
              className="flex flex-col gap-3"
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") go(1)
                if (e.key === "ArrowLeft") go(-1)
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- member picture */}
              <img src={cur.url} alt={cur.caption || `${name}, picture ${(open ?? 0) + 1}`} referrerPolicy="no-referrer" className="max-h-[70vh] w-full rounded-lg object-contain" />
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="min-w-0 flex-1 text-muted-foreground">{cur.caption}</p>
                {items.length > 1 && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" aria-label="Previous picture" onClick={() => go(-1)} className="grid size-9 place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      <ChevronLeftIcon aria-hidden className="size-4" />
                    </button>
                    <span className="tabular text-xs text-muted-foreground">
                      {(open ?? 0) + 1} / {items.length}
                    </span>
                    <button type="button" aria-label="Next picture" onClick={() => go(1)} className="grid size-9 place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      <ChevronRightIcon aria-hidden className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
