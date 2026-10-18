import Link from "next/link"
import { FileArchiveIcon, FileCodeIcon, FileIcon, FileImageIcon, FileTextIcon, FolderIcon, GitBranchIcon, LinkIcon, LockIcon, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { bytes } from "./detail"

export type FileRow = { name: string; href: string | null; type: "file" | "dir" | "symlink" | "submodule"; size: number; note?: string }

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|c|h|cc|cpp|hpp|cs|java|kt|swift|rb|php|lua|sh|bash|zsh|ps1|sql|r|jl|scala|hs|ex|exs|dart|vue|svelte|css|scss|html|xml|json|jsonc|yaml|yml|toml|ini|cfg|ipynb|cu|zig|nix|dockerfile)$/i
const TEXT = /(\.(md|mdx|txt|rst|adoc|csv|tsv|log)|^(license|licence|copying|notice|authors|changelog|readme)(\..*)?)$/i
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i
const ARCHIVE = /\.(zip|gz|tgz|bz2|xz|7z|rar|tar|safetensors|bin|pt|pth|ckpt|onnx|gguf|parquet|arrow|h5|npz|pkl)$/i

function iconFor(row: FileRow): LucideIcon {
  if (row.type === "dir") return FolderIcon
  if (row.type === "submodule") return GitBranchIcon
  if (row.type === "symlink") return LinkIcon
  if (IMAGE.test(row.name)) return FileImageIcon
  if (ARCHIVE.test(row.name)) return FileArchiveIcon
  if (CODE.test(row.name) || /^(dockerfile|makefile)$/i.test(row.name)) return FileCodeIcon
  if (TEXT.test(row.name)) return FileTextIcon
  return FileIcon
}

/** A directory listing: folders first, an icon per kind of file, sizes on the right. */
export function FileList({ rows, up, className }: { rows: FileRow[]; up?: string; className?: string }) {
  return (
    <ul className={cn("overflow-hidden rounded-xl border border-border", className)}>
      {up && (
        <li className="border-b border-border">
          <Link href={up} className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:bg-white/[0.03] hover:text-foreground">
            <FolderIcon aria-hidden className="size-4" />
            <span className="font-mono">..</span>
          </Link>
        </li>
      )}
      {rows.map((f) => {
        const Icon = iconFor(f)
        const inner = (
          <>
            <Icon aria-hidden className={cn("size-4 shrink-0", f.type === "dir" ? "text-ion" : "text-muted-foreground")} />
            <span className="min-w-0 flex-1 truncate font-mono">{f.name}</span>
            {f.note && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                <LockIcon aria-hidden className="size-3" />
                {f.note}
              </span>
            )}
            <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular">{f.type === "file" ? bytes(f.size) : ""}</span>
          </>
        )
        return (
          <li key={f.name} className="border-b border-border last:border-0">
            {f.href ? (
              <Link href={f.href} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.03]">
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80">{inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
