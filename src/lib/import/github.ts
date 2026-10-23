import type { ImportedFacts } from "@/lib/projects"
import { getAllowed, ImportError } from "./fetch"
import { cardImages, type CoverCandidate } from "./images"
import { clipReadme, fit, licenseFrom, summaryFrom, tagsFrom, type Draft } from "./sources"

/*
 * Reading a public GitHub repository for an import: its details, the full README (relative links and pictures
 * made absolute, so the page shows them and the links open in Nexverse's own code browser), the code languages,
 * the latest release, the top-level files with their sizes, and the numbers at that moment. The README and the
 * latest release come from GitHub's file host and releases feed, which have no hourly quota; the details,
 * languages and files come from the API (60 requests an hour without GITHUB_TOKEN, 5,000 with one).
 */

const API = "https://api.github.com"
const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/
const enc = (s: string) => s.split("/").map(encodeURIComponent).join("/")

type GhRepo = {
  full_name?: string
  name?: string
  owner?: { login?: string; avatar_url?: string }
  description?: string | null
  private?: boolean
  archived?: boolean
  fork?: boolean
  default_branch?: string
  stargazers_count?: number
  forks_count?: number
  open_issues_count?: number
  topics?: string[]
  license?: { spdx_id?: string | null } | null
  created_at?: string
  pushed_at?: string
  updated_at?: string
  size?: number
  language?: string | null
}

type Answer = { status: number; text: string }

async function get(url: string, accept = "application/json", maxBytes = 2 * 1024 * 1024): Promise<Answer> {
  const got = await getAllowed(url, { accept, maxBytes, timeoutMs: 15_000 })
  return { status: got.status, text: new TextDecoder().decode(got.body) }
}

function json<T>(a: Answer): T | null {
  if (a.status !== 200) return null
  try {
    return JSON.parse(a.text) as T
  } catch {
    return null
  }
}

const limited = (a: Answer) => a.status === 429 || (a.status === 403 && /rate limit/i.test(a.text))

/** Relative links and pictures in a README made absolute against the repository. */
export function absolutizeReadme(md: string, repo: string, branch: string, dir = ""): string {
  const blob = `https://github.com/${repo}/blob/${encodeURIComponent(branch)}/`
  const raw = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/`
  const fix = (href: string, image: boolean) => {
    const h = href.trim()
    if (!h || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(h)) return h
    try {
      return new URL(h.replace(/^\//, ""), `${image ? raw : blob}${dir ? `${dir}/` : ""}`).toString()
    } catch {
      return h
    }
  }
  return md
    .replace(/(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(\s+"[^"]*")?\s*\)/g, (_m, bang: string, text: string, href: string, title: string | undefined) => `${bang}[${text}](${fix(href, bang === "!")}${title ?? ""})`)
    .replace(/(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'])/gi, (_m, a: string, src: string, b: string) => `${a}${fix(src, true)}${b}`)
    .replace(/(<a\b[^>]*?\bhref\s*=\s*["'])([^"']+)(["'])/gi, (_m, a: string, href: string, b: string) => `${a}${fix(href, false)}${b}`)
}

/** The latest release from the public releases feed: tag, name, date and notes (as plain text). */
async function latestRelease(repo: string): Promise<ImportedFacts["release"]> {
  const a = await get(`https://github.com/${enc(repo)}/releases.atom`, "application/atom+xml", 1_500_000).catch(() => null)
  if (!a || a.status !== 200) return undefined
  const entry = a.text.match(/<entry>([\s\S]*?)<\/entry>/)?.[1]
  if (!entry) return undefined
  const tag = decodeURIComponent(entry.match(/\/releases\/tag\/([^"<]+)/)?.[1] ?? "")
  if (!tag) return undefined
  const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim()
  const date = entry.match(/<updated>([^<]+)<\/updated>/)?.[1]
  const content = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? ""
  const notes = content
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<li>/gi, "\n- ")
    .replace(/<\/(p|h\d|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1500)
  return { tag, name: title && title !== tag ? title.slice(0, 120) : undefined, date, notes: notes || undefined }
}

/** The README as Markdown, from the file host (no quota), trying the usual names. */
async function readme(repo: string, branch: string): Promise<string> {
  for (const name of ["README.md", "readme.md", "Readme.md", "README.markdown", "README.rst", "README.txt", "README"]) {
    const a = await get(`https://raw.githubusercontent.com/${enc(repo)}/${encodeURIComponent(branch)}/${name}`, "text/plain", 1_000_000).catch(() => null)
    if (a?.status === 200 && a.text.trim()) return name.endsWith(".rst") || name.endsWith(".txt") || name === "README" ? `\`\`\`\n${a.text.slice(0, 45_000)}\n\`\`\`` : a.text
  }
  return ""
}

export async function githubRepo(ref: string, type: "repo" | "tool"): Promise<Draft> {
  if (!REPO.test(ref) || ref.includes("..")) throw new ImportError(400, "That is not an owner/repository name.")
  const info = await get(`${API}/repos/${enc(ref)}`)
  if (limited(info)) throw new ImportError(429, "GitHub is limiting requests from this server. Set GITHUB_TOKEN on the server (a read-only token is enough), or try again within the hour.")
  const r = json<GhRepo>(info)
  if (!r?.full_name || r.private) throw new ImportError(404, "GitHub has no public repository with that name.")
  const repo = r.full_name
  const branch = r.default_branch || "HEAD"
  const [md, langsA, filesA, release] = await Promise.all([
    readme(repo, branch),
    get(`${API}/repos/${enc(repo)}/languages`).catch(() => null),
    get(`${API}/repos/${enc(repo)}/contents/?ref=${encodeURIComponent(branch)}`, "application/json", 1_000_000).catch(() => null),
    latestRelease(repo).catch(() => undefined),
  ])
  const langs = (langsA && json<Record<string, number>>(langsA)) ?? {}
  const totalCode = Object.values(langs).reduce((a, b) => a + b, 0)
  const languages = Object.entries(langs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, bytes]) => ({ name, share: totalCode ? Math.round((bytes / totalCode) * 1000) / 10 : 0 }))
  const top = (filesA && json<{ name?: string; type?: string; size?: number }[]>(filesA)) ?? []
  const files = (Array.isArray(top) ? top : [])
    .filter((f) => typeof f.name === "string")
    .sort((a, b) => (a.type === b.type ? String(a.name).localeCompare(String(b.name)) : a.type === "dir" ? -1 : 1))
    .slice(0, 30)
    .map((f) => ({ name: f.type === "dir" ? `${f.name}/` : String(f.name), bytes: f.type === "file" && typeof f.size === "number" ? f.size : undefined }))
  const card = absolutizeReadme(md, repo, branch)
  const name = (r.name ?? repo.split("/")[1]).slice(0, 80)
  const description = (r.description ?? "").replace(/\s+/g, " ").trim()
  const imported: ImportedFacts = {
    at: new Date().toISOString(),
    author: r.owner?.login ?? repo.split("/")[0],
    createdAt: r.created_at,
    updatedAt: r.pushed_at ?? r.updated_at,
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    topics: (r.topics ?? []).slice(0, 20),
    languages: languages.length ? languages : r.language ? [{ name: r.language, share: 100 }] : undefined,
    release,
    files: files.length ? files : undefined,
    fileCount: files.length || undefined,
    totalBytes: typeof r.size === "number" && r.size > 0 ? r.size * 1024 : undefined,
  }
  const facts = [
    { label: "Owner", value: imported.author ?? "" },
    r.stargazers_count !== undefined && { label: "Stars", value: r.stargazers_count.toLocaleString("en") },
    languages[0] && { label: "Language", value: languages.slice(0, 3).map((l) => l.name).join(", ") },
    release && { label: "Latest release", value: release.tag },
    { label: "README", value: card ? `${Math.round(card.length / 100) / 10}K characters` : "none" },
  ].filter((x): x is { label: string; value: string } => Boolean(x && x.value))
  const covers = async (): Promise<CoverCandidate[]> => {
    const out: CoverCandidate[] = cardImages(card, `https://raw.githubusercontent.com/${repo}/${branch}`, 4).map((url) => ({ url, origin: "readme" as const }))
    out.push({ url: `https://opengraph.githubassets.com/1/${repo}`, origin: "social" })
    if (r.owner?.avatar_url?.startsWith("https://avatars.githubusercontent.com/")) out.push({ url: r.owner.avatar_url, origin: "avatar" })
    return out
  }
  return {
    type,
    kind: type === "tool" ? "tool" : "repo",
    projectType: type === "tool" ? "tool" : "other",
    repoUrl: `https://github.com/${repo}`,
    name: name.length >= 2 ? name : `${name}-`,
    summary: description ? fit(description) : summaryFrom(card, `Open-source ${type === "tool" ? "tool" : "repository"} by ${imported.author}.`),
    readme: clipReadme(card || `# ${name}\n\n${description || "This repository has no README yet."}`),
    tags: tagsFrom([...(r.topics ?? []).filter((t) => !/hugging/.test(t)), languages[0]?.name ?? null]),
    license: licenseFrom(r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : undefined),
    langs: [],
    specs: { imported },
    source: { site: "github", type, ref: repo, importedAt: new Date().toISOString() },
    files: [],
    facts,
    covers,
  }
}
