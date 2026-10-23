import type { ImportedFacts } from "@/lib/projects"
import { slugify } from "@/lib/projects"
import { getAllowed, ImportError } from "./fetch"
import type { CoverCandidate } from "./images"
import { fit, type Draft } from "./sources"

/*
 * Reading a paper from arXiv's own API for an import: title, every author, the abstract, the categories, the
 * submission and update dates, and the first figure of its HTML version as the cover (copied into Nexverse with
 * a credit). The paper is shown in Nexverse; the credit names arXiv and the id, with no outbound link.
 */

export const ARXIV_ID = /^\d{4}\.\d{4,5}$/

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()

const tag = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "")

/** The first figure of the paper's HTML version, when arXiv has one. */
async function firstFigure(id: string): Promise<CoverCandidate[]> {
  const got = await getAllowed(`https://arxiv.org/html/${id}`, { accept: "text/html", maxBytes: 4 * 1024 * 1024, timeoutMs: 15_000 }).catch(() => null)
  if (!got || got.status !== 200) return []
  const html = new TextDecoder().decode(got.body)
  const base = `https://arxiv.org/html/${id}/`
  const out: CoverCandidate[] = []
  for (const m of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+\.(?:png|jpe?g|gif|webp))["'][^>]*>/gi)) {
    if (/\b(width|height)=["']?([1-7]?\d)["'\s>]/i.test(m[0])) continue
    try {
      const u = new URL(m[1], base)
      if (u.hostname === "arxiv.org") out.push({ url: u.toString(), origin: "readme" })
    } catch {
      continue
    }
    if (out.length >= 2) break
  }
  return out
}

export async function arxivPaper(id: string): Promise<Draft> {
  if (!ARXIV_ID.test(id)) throw new ImportError(400, "That is not an arXiv id like 2410.21276.")
  const got = await getAllowed(`https://export.arxiv.org/api/query?id_list=${id}&max_results=1`, { accept: "application/atom+xml", maxBytes: 1024 * 1024, timeoutMs: 20_000 })
  if (got.status === 429 || got.status === 503) throw new ImportError(429, "arXiv asks to slow down. Try again in a minute.")
  if (got.status !== 200) throw new ImportError(502, `arXiv answered ${got.status}.`)
  const xml = new TextDecoder().decode(got.body)
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1]
  const title = entry ? tag(entry, "title") : ""
  if (!entry || !title || /^Error$/i.test(title)) throw new ImportError(404, "arXiv has no paper with that id.")
  const abstract = tag(entry, "summary")
  const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => decode(m[1])).filter((a) => /\p{L}/u.test(a))
  const categories = [...new Set([...entry.matchAll(/<category[^>]*term="([^"]+)"/g)].map((m) => m[1]))].slice(0, 12)
  const published = tag(entry, "published")
  const updated = tag(entry, "updated")
  const comment = tag(entry, "arxiv:comment")
  const readme = [
    `# ${title}`,
    authors.length ? `**Authors:** ${authors.slice(0, 40).join(", ")}${authors.length > 40 ? ", et al." : ""}` : "",
    "## Abstract",
    abstract,
    comment ? `*${comment}*` : "",
    categories.length ? `**Categories:** ${categories.join(", ")}` : "",
    `*From arXiv, paper arXiv:${id}.*`,
  ]
    .filter(Boolean)
    .join("\n\n")
  const imported: ImportedFacts = { at: new Date().toISOString(), author: authors[0], authors: authors.slice(0, 40), categories, arxivId: id, createdAt: published || undefined, updatedAt: updated || undefined }
  const first = abstract.match(/^(.{20,157}?[.!?])(\s|$)/)?.[1] ?? abstract
  const tags = [...new Set(categories.map((c) => slugify(c.replace(".", "-"))).filter((t) => /^[a-z0-9][a-z0-9-]{0,29}$/.test(t)))].slice(0, 8)
  return {
    type: "paper",
    kind: "repo",
    projectType: "paper",
    name: title.slice(0, 80).padEnd(2, "-"),
    summary: fit(first || `Research paper arXiv:${id}`),
    readme,
    tags,
    license: "unspecified",
    langs: ["en"],
    specs: { imported },
    source: { site: "arxiv", type: "paper", ref: id, importedAt: new Date().toISOString() },
    files: [],
    facts: [
      { label: "Authors", value: authors.length ? `${authors[0]}${authors.length > 1 ? ` and ${authors.length - 1} more` : ""}` : "not listed" },
      categories[0] ? { label: "Category", value: categories[0] } : null,
      published ? { label: "Submitted", value: published.slice(0, 10) } : null,
    ].filter((x): x is { label: string; value: string } => Boolean(x)),
    covers: () => firstFigure(id),
  }
}
