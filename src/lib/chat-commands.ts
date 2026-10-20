/**
 * Slash commands for the chat and messages composers. Pure functions: `runCommand` reads what was typed and says
 * what to do (send this text, open the poll builder, catch me up, …); the composer does it.
 */

export type CommandAction = "code" | "poll" | "sticker" | "catchup" | "search" | "jump" | "pins" | "saved" | "help" | "thread"

export type CommandResult =
  | { type: "send"; body: string; kind: "text" | "me" }
  | { type: "action"; action: CommandAction; arg: string }
  | { type: "error"; message: string }
  | null

export type Command = { name: string; args?: string; hint: string; /** Only where it makes sense: rooms, or messages too. */ where: "room" | "both"; ai?: boolean }

export const COMMANDS: Command[] = [
  { name: "poll", args: "Question | Option | Option", hint: "Ask the room to vote", where: "room" },
  { name: "code", args: "language", hint: "Start a code block", where: "both" },
  { name: "sticker", hint: "Send one of our space stickers", where: "both" },
  { name: "me", args: "does something", hint: "Say what you are doing, in italics", where: "both" },
  { name: "shrug", args: "text", hint: "Add ¯\\_(ツ)_/¯", where: "both" },
  { name: "tableflip", hint: "(╯°□°)╯︵ ┻━┻", where: "both" },
  { name: "unflip", hint: "┬─┬ノ( º _ ºノ)", where: "both" },
  { name: "spoiler", args: "text", hint: "Hide text until someone taps it", where: "both" },
  { name: "roll", args: "2d6", hint: "Roll dice, out in the open", where: "both" },
  { name: "summarise", hint: "Catch me up on what I missed", where: "room", ai: true },
  { name: "search", args: "words", hint: "Search this room", where: "room" },
  { name: "jump", args: "2026-10-01", hint: "Jump to a date", where: "room" },
  { name: "pins", hint: "Show pinned messages", where: "room" },
  { name: "saved", hint: "Show your saved messages", where: "room" },
  { name: "shortcuts", hint: "Keyboard shortcuts", where: "both" },
]

/** The commands that match what was typed after "/", for the menu above the box. */
export function matchCommands(draft: string, where: "room" | "dm", ai: boolean): Command[] {
  const m = /^\/([a-z]*)$/i.exec(draft)
  if (!m) return []
  const q = m[1].toLowerCase()
  return COMMANDS.filter((c) => (where === "room" || c.where === "both") && (ai || !c.ai) && c.name.startsWith(q))
}

function roll(spec: string): string | null {
  const m = /^(\d{0,2})d(\d{1,3})$/i.exec(spec || "1d6")
  if (!m) return null
  const n = Math.min(Math.max(Number(m[1] || 1), 1), 20)
  const sides = Math.min(Math.max(Number(m[2]), 2), 1000)
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides))
  const total = rolls.reduce((a, b) => a + b, 0)
  return `🎲 rolled ${n}d${sides}: ${rolls.join(" + ")}${n > 1 ? ` = ${total}` : ""}`
}

/** Reads a draft that starts with "/". Anything that is not a command is sent as it is (null). */
export function runCommand(draft: string): CommandResult {
  const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(draft.trim())
  if (!m) return null
  const name = m[1].toLowerCase()
  const arg = (m[2] ?? "").trim()
  switch (name) {
    case "me":
      return arg ? { type: "send", body: arg, kind: "me" } : { type: "error", message: "Write what you are doing after /me." }
    case "shrug":
      return { type: "send", body: `${arg ? `${arg} ` : ""}¯\\_(ツ)_/¯`, kind: "text" }
    case "tableflip":
      return { type: "send", body: `${arg ? `${arg} ` : ""}(╯°□°)╯︵ ┻━┻`, kind: "text" }
    case "unflip":
      return { type: "send", body: `${arg ? `${arg} ` : ""}┬─┬ノ( º _ ºノ)`, kind: "text" }
    case "spoiler":
      return arg ? { type: "send", body: `||${arg.replace(/\|\|/g, "")}||`, kind: "text" } : { type: "error", message: "Write the hidden text after /spoiler." }
    case "roll": {
      const r = roll(arg)
      return r ? { type: "send", body: r, kind: "text" } : { type: "error", message: "Roll like this: /roll 2d6" }
    }
    case "poll":
    case "code":
    case "sticker":
    case "search":
    case "jump":
    case "pins":
    case "saved":
      return { type: "action", action: name, arg }
    case "summarise":
    case "summarize":
    case "catchup":
      return { type: "action", action: "catchup", arg }
    case "shortcuts":
    case "help":
      return { type: "action", action: "help", arg }
    default:
      return null
  }
}

/** "Question | A | B" → a poll draft. */
export function parsePollArg(arg: string): { question: string; options: string[] } {
  const parts = arg.split("|").map((p) => p.trim())
  return { question: parts[0] ?? "", options: parts.slice(1).filter(Boolean) }
}
