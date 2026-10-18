import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { AppWindowIcon, BoxIcon, CpuIcon, DatabaseIcon, DownloadIcon, HeartIcon, LockIcon, type LucideIcon } from "lucide-react"
import { Chip, Cover } from "@/components/hub/bits"
import { CopyButton } from "@/components/hub/copy-button"
import { LikeButton } from "@/components/hub/like-button"
import { MotionTabs } from "@/components/hub/motion-tabs"
import { SaveButton } from "@/components/social/save-button"
import { compact } from "@/lib/data"
import { hfFile, hfItem, hfReadme, type HfDetail, type HfFileEntry } from "@/lib/live/hub"
import { discussItemHref, HF_PREFIX, hfBlobHref, hfHref, HUB_TARGET, liveTarget } from "@/lib/live/ids"
import type { HubKind } from "@/lib/live/types"
import { cn } from "@/lib/utils"
import { CodeView } from "./code-block"
import { bytes, DetailBanner, DiscussButton, Empty, ErrorPanel, InfoRow, Panel, SourceLink } from "./detail"
import { FileList, type FileRow } from "./file-list"
import { Markdown } from "./markdown"
import { SpaceEmbed } from "./space-embed"
import { spaceGradient } from "./space-card"
import { TimeAgo } from "./time"

/* The in-site page of a Hugging Face model, dataset or Space, and its file viewer. */

const KIND: Record<HubKind, { label: string; plural: string; icon: LucideIcon; tone: string; cover: "model" | "dataset" | "tool"; anchor: string }> = {
  model: { label: "Model", plural: "Models", icon: BoxIcon, tone: "text-model", cover: "model", anchor: "/trending#models" },
  dataset: { label: "Dataset", plural: "Datasets", icon: DatabaseIcon, tone: "text-dataset", cover: "dataset", anchor: "/trending#datasets" },
  space: { label: "Space", plural: "Spaces", icon: AppWindowIcon, tone: "text-tool", cover: "tool", anchor: "/trending#spaces" },
}

function crumbs(kind: HubKind, owner: string) {
  const K = KIND[kind]
  return [
    {
      href: K.anchor,
      label: (
        <>
          <K.icon aria-hidden className="size-4" /> {K.plural}
        </>
      ),
    },
    { label: owner },
  ]
}

function SpaceArt({ d }: { d: Pick<HfDetail, "colorFrom" | "colorTo" | "emoji" | "id"> }) {
  return (
    <div aria-hidden className="flex size-full items-center justify-center" style={{ background: spaceGradient(d.colorFrom, d.colorTo) }}>
      {d.emoji && <span className="text-5xl drop-shadow-[0_4px_12px_rgb(0_0_0/0.5)]">{d.emoji}</span>}
    </div>
  )
}

function Tile({ d, size = "lg" }: { d: HfDetail; size?: "lg" | "sm" }) {
  const box = size === "lg" ? "size-16 md:size-20" : "size-10"
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/15", box)}>
      {d.kind === "space" ? (
        <div className="flex size-full items-center justify-center" style={{ background: spaceGradient(d.colorFrom, d.colorTo) }}>
          <span className={size === "lg" ? "text-3xl" : "text-lg"}>{d.emoji || "🚀"}</span>
        </div>
      ) : (
        <Cover seed={`hf-${d.kind}-${d.id}`} kind={KIND[d.kind].cover} />
      )}
    </div>
  )
}

function Pill({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary/60 px-3.5 text-sm" title={label}>
      <Icon aria-hidden className="size-4 text-muted-foreground" />
      <span className="tabular">{compact(value)}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

function Header({ d }: { d: HfDetail }) {
  const K = KIND[d.kind]
  const target = liveTarget(HUB_TARGET[d.kind], d.id)
  const display = d.kind === "space" && d.title ? d.title : d.name
  const discuss = discussItemHref(display === d.name ? d.id : `${display} (${d.id})`, `About the ${K.label.toLowerCase()} ${d.id}${d.description ? `: ${d.description}` : ""}\n\n${hfHref(d.kind, d.id)}`)
  return (
    <DetailBanner seed={`hf-${d.kind}-${d.id}`} kind={K.cover} crumbs={crumbs(d.kind, d.owner)} art={d.kind === "space" ? <SpaceArt d={d} /> : undefined}>
      <div className="flex flex-wrap items-center gap-4">
        <Tile d={d} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] break-words md:text-4xl">
            {d.kind === "space" && d.title ? (
              d.title
            ) : (
              <>
                <span className="text-muted-foreground">{d.owner}/</span>
                {d.name}
              </>
            )}
          </h1>
          {d.kind === "space" && d.title && <p className="font-mono text-sm text-muted-foreground">{d.id}</p>}
          {d.description && <p className="max-w-[70ch] text-muted-foreground">{d.description}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {target && <LikeButton target={target} />}
        {target && <SaveButton target={target} />}
        <DiscussButton href={discuss} />
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
        {d.kind !== "space" && <Pill icon={DownloadIcon} value={d.downloads} label="downloads" />}
        <Pill icon={HeartIcon} value={d.likes} label="likes" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("mr-1 inline-flex items-center gap-1 text-xs font-medium", K.tone)}>
          <K.icon aria-hidden className="size-3.5" />
          {K.label}
        </span>
        {d.task && <Chip>{d.task}</Chip>}
        {d.library && <Chip className="font-mono">{d.library}</Chip>}
        {d.license && <Chip>{d.license}</Chip>}
        {d.languages.slice(0, 6).map((l) => (
          <Chip key={l} className="font-mono uppercase">
            {l}
          </Chip>
        ))}
        {d.gated && (
          <Chip className="gap-1 text-gold">
            <LockIcon aria-hidden className="size-3" /> Gated
          </Chip>
        )}
        {d.tags.slice(0, 8).map((t) => (
          <Chip key={t}>#{t}</Chip>
        ))}
      </div>
    </DetailBanner>
  )
}

const TEXT_FILE = /(\.(md|txt|json|jsonl|yaml|yml|toml|py|js|ts|sh|cfg|ini|csv|tsv|jinja|j2|html|css|ipynb|rst|xml|tiktoken|vocab)|^(license|licence|notice|dockerfile|requirements\.txt|readme)(\..*)?|\/(license|licence|dockerfile))$/i

const viewable = (f: HfFileEntry) => !f.lfs && f.size <= 200_000 && TEXT_FILE.test(f.path)

function fileRows(d: HfDetail): FileRow[] {
  return d.files.slice(0, 400).map((f) => ({
    name: f.path,
    type: "file" as const,
    size: f.size,
    href: viewable(f) ? hfBlobHref(d.kind, d.id, f.path) : null,
    note: f.lfs ? "LFS" : undefined,
  }))
}

function Command({ d }: { d: HfDetail }) {
  const cmd =
    d.kind === "space"
      ? `git clone https://huggingface.co/spaces/${d.id}`
      : `huggingface-cli download ${d.id}${d.kind === "dataset" ? " --repo-type dataset" : ""}`
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{d.kind === "space" ? "Clone" : "Download"}</span>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-[#07080d] py-1 pr-1 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-[#cfd8ea]" title={cmd}>
          {cmd}
        </code>
        <span className="shrink-0 text-xs text-muted-foreground">
          <CopyButton text={cmd} />
        </span>
      </div>
    </div>
  )
}

function RepoLinks({ label, kind, ids }: { label: string; kind: HubKind; ids: string[] }) {
  if (!ids.length) return null
  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <ul className="flex flex-col gap-1">
        {ids.map((id) => (
          <li key={id}>
            <Link href={hfHref(kind, id)} className="block truncate font-mono text-xs text-ion hover:underline">
              {id}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Unavailable({ kind, id, reason }: { kind: HubKind; id: string; reason: "ratelimit" | "error" | "toolarge" }) {
  const [owner, name] = id.split("/")
  return (
    <>
      <DetailBanner seed={`hf-${kind}-${id}`} kind={KIND[kind].cover} crumbs={crumbs(kind, owner)}>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] break-words md:text-4xl">
          <span className="text-muted-foreground">{owner}/</span>
          {name}
        </h1>
      </DetailBanner>
      <div className="shell flex max-w-3xl flex-col gap-6 pt-8">
        <ErrorPanel reason={reason} />
      </div>
    </>
  )
}

export async function HfView({ kind, id }: { kind: HubKind; id: string }) {
  const res = await hfItem(kind, id)
  if (!res.ok) {
    if (res.reason === "notfound") notFound()
    return <Unavailable kind={kind} id={id} reason={res.reason} />
  }
  const d = res.data
  if (d.id !== id) redirect(hfHref(kind, d.id))
  const readme = await hfReadme(kind, d.id)
  const K = KIND[kind]

  const card = readme.ok ? (
    readme.data.text.trim() ? (
      <Markdown source={readme.data.text} ctx={{ source: "hf", kind, id: d.id, dir: "" }} />
    ) : (
      <Empty>The card is empty.</Empty>
    )
  ) : readme.reason === "notfound" ? (
    <Empty>{d.gated ? "The authors ask visitors to accept their terms before reading this card." : `This ${K.label.toLowerCase()} has no card yet.`}</Empty>
  ) : (
    <ErrorPanel reason={readme.reason} what="the card" />
  )

  const files = d.files.length ? (
    <div className="flex flex-col gap-2">
      <FileList rows={fileRows(d)} />
      {d.files.length > 400 && <p className="text-xs text-muted-foreground">Showing 400 of {d.files.length.toLocaleString("en")} files.</p>}
    </div>
  ) : (
    <Empty>No files listed.</Empty>
  )

  const app =
    d.kind === "space" ? (
      d.running && d.host ? (
        <SpaceEmbed host={d.host} title={d.title || d.id} cover={<SpaceArt d={d} />} />
      ) : (
        <Empty>
          This Space is {d.stage ? d.stage.toLowerCase().replace(/_/g, " ") : "not running"} right now, so there is no app to open. Its card and files are still here.
        </Empty>
      )
    ) : null

  const tabs = [
    ...(app ? [{ id: "app", label: "App", content: app }] : []),
    { id: "card", label: kind === "model" ? "Model card" : kind === "dataset" ? "Dataset card" : "About", content: card },
    { id: "files", label: "Files", count: d.files.length, content: files },
  ]

  return (
    <>
      <Header d={d} />
      <div className="shell grid grid-cols-1 gap-10 pt-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <MotionTabs className="min-w-0" tabs={tabs} />
        <aside className="flex flex-col gap-6">
          <Panel label="Details">
            {d.kind !== "space" && (
              <InfoRow label="Downloads">
                <span className="tabular" title="Last 30 days">
                  {d.downloads.toLocaleString("en")}
                </span>
              </InfoRow>
            )}
            <InfoRow label="Likes">
              <span className="tabular">{d.likes.toLocaleString("en")}</span>
            </InfoRow>
            {d.task && <InfoRow label={kind === "space" ? "SDK" : "Task"}>{d.task}</InfoRow>}
            {d.library && (
              <InfoRow label="Library">
                <span className="font-mono text-xs">{d.library}</span>
              </InfoRow>
            )}
            <InfoRow label="Licence">{d.license || "Not stated"}</InfoRow>
            {d.kind === "space" && d.hardware && (
              <InfoRow label="Hardware">
                <span className="inline-flex items-center gap-1 font-mono text-xs">
                  <CpuIcon aria-hidden className="size-3.5 text-muted-foreground" />
                  {d.hardware}
                </span>
              </InfoRow>
            )}
            {d.kind === "space" && d.stage && (
              <InfoRow label="Status">
                <span className={cn("inline-flex items-center gap-1.5", d.running ? "text-ok" : "text-muted-foreground")}>
                  <span aria-hidden className={cn("size-1.5 rounded-full", d.running ? "bg-ok" : "bg-muted-foreground")} />
                  {d.running ? "Running" : d.stage.toLowerCase().replace(/_/g, " ")}
                </span>
              </InfoRow>
            )}
            <InfoRow label="Updated">
              <TimeAgo date={d.updatedAt} />
            </InfoRow>
            {d.createdAt && (
              <InfoRow label="Created">
                <TimeAgo date={d.createdAt} />
              </InfoRow>
            )}
            <InfoRow label="Files">
              <span className="tabular">
                {d.files.length.toLocaleString("en")}
                {d.totalSize > 0 && <span className="text-muted-foreground"> · {bytes(d.totalSize)}</span>}
              </span>
            </InfoRow>
            {d.languages.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">Languages</span>
                <div className="flex flex-wrap gap-1.5">
                  {d.languages.map((l) => (
                    <span key={l} className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs uppercase">
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <RepoLinks label="Base model" kind="model" ids={d.baseModels} />
            <RepoLinks label="Trained on" kind="dataset" ids={d.datasets} />
            <RepoLinks label="Models used" kind="model" ids={d.models} />
            <div className="border-t border-border pt-3">
              <Command d={d} />
            </div>
          </Panel>
        </aside>
      </div>
      <div className="shell mt-12">
        <SourceLink href={`https://huggingface.co/${HF_PREFIX[kind]}${d.id}`} label="View on Hugging Face" />
      </div>
    </>
  )
}

/** One small text file of a Hub repo, shown inside Nexverse. */
export async function HfFileView({ kind, id, path }: { kind: HubKind; id: string; path: string }) {
  const res = await hfItem(kind, id)
  if (!res.ok) {
    if (res.reason === "notfound") notFound()
    return <Unavailable kind={kind} id={id} reason={res.reason} />
  }
  const d = res.data
  const entry = d.files.find((f) => f.path === path)
  if (!entry) notFound()
  const file = await hfFile(kind, d.id, path, entry.size, entry.lfs)
  const name = path.split("/").pop() ?? path
  let body: React.ReactNode
  if (!file.ok) body = file.reason === "notfound" ? <Empty>This file is not available to read here.</Empty> : <ErrorPanel reason={file.reason} what={name} />
  else if (file.data.kind === "text" && /\.md$/i.test(path))
    body = (
      <div className="rounded-xl border border-border p-5 md:p-8">
        <Markdown source={file.data.text} ctx={{ source: "hf", kind, id: d.id, dir: path.split("/").slice(0, -1).join("/") }} />
      </div>
    )
  else if (file.data.kind === "text") body = <CodeView text={file.data.text} name={name} actions={<span className="tabular">{bytes(file.data.bytes)}</span>} />
  else body = <Empty>{file.data.kind === "toolarge" ? `This file is ${bytes(file.data.size)}, too big to show here.` : `This is a binary file (${bytes(file.data.size)}), so there is nothing to read here.`}</Empty>

  return (
    <>
      <DetailBanner seed={`hf-${kind}-${d.id}`} kind={KIND[kind].cover} crumbs={crumbs(kind, d.owner)} art={kind === "space" ? <SpaceArt d={d} /> : undefined}>
        <div className="flex flex-wrap items-center gap-3">
          <Tile d={d} size="sm" />
          <Link href={hfHref(kind, d.id)} className="text-xl font-semibold tracking-[-0.02em] break-words hover:underline md:text-2xl">
            <span className="text-muted-foreground">{d.owner}/</span>
            {d.name}
          </Link>
        </div>
      </DetailBanner>
      <div className="shell flex flex-col gap-4 pt-6">
        <nav aria-label="Path" className="flex flex-wrap items-center gap-1 font-mono text-sm">
          <Link href={hfHref(kind, d.id)} className="text-ion hover:underline">
            {d.name}
          </Link>
          <span aria-hidden className="text-muted-foreground">
            /
          </span>
          <span>{path}</span>
        </nav>
        {body}
        <SourceLink className="mt-8" href={`https://huggingface.co/${HF_PREFIX[kind]}${d.id}/blob/main/${path.split("/").map(encodeURIComponent).join("/")}`} label="View on Hugging Face" />
      </div>
    </>
  )
}
