/*
 * What kind of file a path is: its language (for the language bar and the highlighter), whether it is an image
 * we can preview, and whether it is a notebook or a README. Colours are the site's own palette, not GitHub's.
 */

export type Syntax = "c" | "hash" | "json" | "markup" | "css" | "sql" | "markdown" | "plain"

export type Lang = { name: string; color: string; syntax: Syntax; keywords?: string }

const JS = "break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await null undefined true false as interface type enum implements private protected public readonly declare namespace abstract keyof satisfies"
const PY = "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield None True False self match case"
const RS = "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while"
const GO = "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false"
const C = "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false nullptr class namespace template typename public private protected virtual override new delete this using try catch throw include define"
const JAVA = "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record fun val when object companion data sealed"
const SH = "if then else elif fi for while until do done case esac in function return export local set unset echo exit source"
const RB = "alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield require attr_accessor"
const SQL = "select from where and or not insert into values update set delete create table index view function returns return begin end if exists primary key references join left right inner outer on group by order having limit offset as distinct union all null is in like case when then else grant revoke alter drop with language security definer policy trigger"

const L = {
  ts: { name: "TypeScript", color: "#8fb4ff", syntax: "c", keywords: JS },
  js: { name: "JavaScript", color: "#e9c79a", syntax: "c", keywords: JS },
  py: { name: "Python", color: "#9fe3cf", syntax: "hash", keywords: PY },
  rs: { name: "Rust", color: "#e3a68f", syntax: "c", keywords: RS },
  go: { name: "Go", color: "#7fd4e0", syntax: "c", keywords: GO },
  c: { name: "C", color: "#b8bfcc", syntax: "c", keywords: C },
  cpp: { name: "C++", color: "#d39ab8", syntax: "c", keywords: C },
  cs: { name: "C#", color: "#a9d18e", syntax: "c", keywords: JAVA },
  java: { name: "Java", color: "#d8a46a", syntax: "c", keywords: JAVA },
  kt: { name: "Kotlin", color: "#b9a7ff", syntax: "c", keywords: JAVA },
  swift: { name: "Swift", color: "#ff9f80", syntax: "c", keywords: JAVA },
  rb: { name: "Ruby", color: "#ff8f8f", syntax: "hash", keywords: RB },
  php: { name: "PHP", color: "#a3a9e0", syntax: "c", keywords: JS },
  sh: { name: "Shell", color: "#a8e08f", syntax: "hash", keywords: SH },
  sql: { name: "SQL", color: "#e0c98f", syntax: "sql", keywords: SQL },
  html: { name: "HTML", color: "#ffad8f", syntax: "markup" },
  xml: { name: "XML", color: "#c9b48f", syntax: "markup" },
  vue: { name: "Vue", color: "#7fe0b0", syntax: "markup" },
  svelte: { name: "Svelte", color: "#ff9a7a", syntax: "markup" },
  css: { name: "CSS", color: "#b4a0ff", syntax: "css" },
  json: { name: "JSON", color: "#949cad", syntax: "json" },
  yaml: { name: "YAML", color: "#c8b1e8", syntax: "hash" },
  toml: { name: "TOML", color: "#c8a88f", syntax: "hash" },
  md: { name: "Markdown", color: "#cfd8ea", syntax: "markdown" },
  ipynb: { name: "Jupyter Notebook", color: "#f0b27a", syntax: "json" },
  r: { name: "R", color: "#8fb0e0", syntax: "hash", keywords: "function if else for while repeat break next return TRUE FALSE NULL NA in library" },
  lua: { name: "Lua", color: "#8f9fe0", syntax: "plain" },
  dart: { name: "Dart", color: "#7fc8e0", syntax: "c", keywords: JAVA },
  dockerfile: { name: "Dockerfile", color: "#8fc0e0", syntax: "hash", keywords: "FROM RUN CMD LABEL EXPOSE ENV ADD COPY ENTRYPOINT VOLUME USER WORKDIR ARG ONBUILD HEALTHCHECK SHELL AS" },
  make: { name: "Makefile", color: "#b0c48f", syntax: "hash" },
  text: { name: "Text", color: "#6b7383", syntax: "plain" },
} satisfies Record<string, Lang>

const EXT: Record<string, keyof typeof L> = {
  ts: "ts", tsx: "ts", mts: "ts", cts: "ts",
  js: "js", jsx: "js", mjs: "js", cjs: "js",
  py: "py", pyi: "py",
  rs: "rs", go: "go",
  c: "c", h: "c",
  cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", cu: "cpp",
  cs: "cs", java: "java", kt: "kt", kts: "kt", swift: "swift", rb: "rb", php: "php",
  sh: "sh", bash: "sh", zsh: "sh", fish: "sh",
  sql: "sql", html: "html", htm: "html", xml: "xml", svg: "xml", vue: "vue", svelte: "svelte",
  css: "css", scss: "css", less: "css",
  json: "json", jsonc: "json", json5: "json",
  yml: "yaml", yaml: "yaml", toml: "toml", ini: "toml", cfg: "toml",
  md: "md", mdx: "md", markdown: "md", ipynb: "ipynb", r: "r", lua: "lua", dart: "dart",
  txt: "text",
}

const base = (path: string) => path.slice(path.lastIndexOf("/") + 1)

/** The language of a path, or null when we do not know it (binary files, data, unknown extensions). */
export function langOf(path: string): Lang | null {
  const name = base(path).toLowerCase()
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return L.dockerfile
  if (name === "makefile" || name === "gnumakefile") return L.make
  const dot = name.lastIndexOf(".")
  if (dot < 0) return null
  const key = EXT[name.slice(dot + 1)]
  return key ? L[key] : null
}

/** Languages that count towards the language bar (not prose, config or data). */
export function countsAsCode(lang: Lang) {
  return !["Markdown", "Text", "JSON", "YAML", "TOML"].includes(lang.name)
}

const IMAGE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon", bmp: "image/bmp" }

/** The image MIME type when the browser can preview the file. */
export function imageType(path: string): string | null {
  const name = base(path).toLowerCase()
  return IMAGE[name.slice(name.lastIndexOf(".") + 1)] ?? null
}

export const isReadme = (path: string) => /^readme(\.(md|markdown|mdx|txt|rst))?$/i.test(base(path))
export const isMarkdown = (path: string) => /\.(md|markdown|mdx)$/i.test(path)
export const isNotebook = (path: string) => /\.ipynb$/i.test(path)

/** True when the bytes look like text: no NUL in the first 8 KB and valid UTF-8. */
export function looksLikeText(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 8000)
  if (head.includes(0)) return false
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, 64000))
    return true
  } catch {
    // A multi-byte character cut at the 64 KB boundary is still text.
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, 63990))
      return true
    } catch {
      return false
    }
  }
}

/** Content type for downloads and uploads. */
export function mimeOf(path: string): string {
  return imageType(path) ?? (langOf(path) || /\.(txt|csv|tsv|log|lock)$/i.test(path) ? "text/plain" : "application/octet-stream")
}
