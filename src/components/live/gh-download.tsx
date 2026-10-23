import { DownloadIcon } from "lucide-react"
import { ghDownloadHref, type GhDownloadRequest } from "@/lib/code/gh-download"
import { cn } from "@/lib/utils"

/*
 * Download links for GitHub content. Each one points at Nexverse's own /api/gh/download, which streams the
 * bytes from GitHub, so the member stays on Nexverse and the browser simply saves the file.
 */

export function GhDownloadLink({
  req,
  children,
  variant = "quiet",
  className,
}: {
  req: GhDownloadRequest
  children: React.ReactNode
  /** "primary" is the one solid button of a section; "quiet" is a small outline pill; "text" is an inline link. */
  variant?: "primary" | "quiet" | "text"
  className?: string
}) {
  const filename = req.kind === "asset" ? req.name : req.kind === "file" ? req.path.split("/").pop() : undefined
  return (
    <a
      href={ghDownloadHref(req)}
      download={filename ?? ""}
      rel="nofollow"
      className={cn(
        variant === "primary" && "pressable inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground",
        variant === "quiet" && "pressable inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-foreground transition-colors hover:bg-secondary",
        variant === "text" && "inline-flex items-center gap-1 text-ion hover:underline",
        className
      )}
    >
      {variant !== "text" && <DownloadIcon aria-hidden className="size-4 shrink-0" />}
      {children}
    </a>
  )
}
