/**
 * A compact emoji set for the editor's picker and ":name" suggestions: the ones people actually use in technical
 * writing and community posts, grouped, each with a short name and a few search words. Plain Unicode, so posts
 * stay readable everywhere.
 */

export type Emoji = { e: string; name: string; words: string }

export const EMOJI_GROUPS: { label: string; list: Emoji[] }[] = [
  {
    label: "Space",
    list: [
      { e: "🚀", name: "rocket", words: "launch ship release" },
      { e: "🌌", name: "milky_way", words: "galaxy universe night" },
      { e: "🪐", name: "ringed_planet", words: "saturn planet orbit" },
      { e: "🌍", name: "earth", words: "world globe planet" },
      { e: "🌙", name: "moon", words: "crescent night" },
      { e: "⭐", name: "star", words: "favourite rating" },
      { e: "🌟", name: "glowing_star", words: "shine highlight" },
      { e: "✨", name: "sparkles", words: "new magic shiny" },
      { e: "☄️", name: "comet", words: "meteor fast" },
      { e: "🛰️", name: "satellite", words: "orbit signal" },
      { e: "🔭", name: "telescope", words: "explore research" },
      { e: "👽", name: "alien", words: "space ufo" },
      { e: "🛸", name: "ufo", words: "flying saucer" },
      { e: "🌠", name: "shooting_star", words: "wish meteor" },
    ],
  },
  {
    label: "Reactions",
    list: [
      { e: "👍", name: "thumbs_up", words: "+1 yes like agree" },
      { e: "👎", name: "thumbs_down", words: "-1 no dislike" },
      { e: "👏", name: "clap", words: "applause bravo" },
      { e: "🙌", name: "raised_hands", words: "celebrate hooray" },
      { e: "🙏", name: "thanks", words: "please pray thank" },
      { e: "💪", name: "muscle", words: "strong power" },
      { e: "👀", name: "eyes", words: "look watching" },
      { e: "🤝", name: "handshake", words: "deal agree" },
      { e: "👋", name: "wave", words: "hello hi bye" },
      { e: "✅", name: "check", words: "done yes ok" },
      { e: "❌", name: "cross", words: "no wrong fail" },
      { e: "⚠️", name: "warning", words: "caution careful" },
      { e: "❓", name: "question", words: "help ask" },
      { e: "❗", name: "exclamation", words: "important" },
      { e: "💯", name: "100", words: "perfect score" },
      { e: "🔥", name: "fire", words: "hot lit trending" },
      { e: "🎉", name: "tada", words: "party celebrate congrats" },
      { e: "❤️", name: "heart", words: "love like" },
      { e: "💡", name: "bulb", words: "idea tip" },
    ],
  },
  {
    label: "Faces",
    list: [
      { e: "😀", name: "grin", words: "happy smile" },
      { e: "😄", name: "smile", words: "happy joy" },
      { e: "😂", name: "joy", words: "laugh tears lol" },
      { e: "🙂", name: "slight_smile", words: "ok fine" },
      { e: "😉", name: "wink", words: "joke" },
      { e: "😍", name: "heart_eyes", words: "love" },
      { e: "🤩", name: "star_struck", words: "wow amazing" },
      { e: "🤔", name: "thinking", words: "hmm consider" },
      { e: "🤯", name: "mind_blown", words: "wow shocked" },
      { e: "😅", name: "sweat_smile", words: "phew oops" },
      { e: "😬", name: "grimace", words: "awkward yikes" },
      { e: "😢", name: "cry", words: "sad" },
      { e: "😮", name: "open_mouth", words: "surprised" },
      { e: "😎", name: "sunglasses", words: "cool" },
      { e: "🤓", name: "nerd", words: "geek smart" },
      { e: "🥳", name: "partying", words: "party celebrate" },
      { e: "😴", name: "sleeping", words: "tired zzz" },
      { e: "🫡", name: "salute", words: "respect yes" },
    ],
  },
  {
    label: "Work",
    list: [
      { e: "🤖", name: "robot", words: "ai bot model" },
      { e: "🧠", name: "brain", words: "ai mind think" },
      { e: "💻", name: "laptop", words: "computer code" },
      { e: "🖥️", name: "desktop", words: "computer screen" },
      { e: "⌨️", name: "keyboard", words: "type code" },
      { e: "🧪", name: "test_tube", words: "experiment lab test" },
      { e: "🔬", name: "microscope", words: "research science" },
      { e: "📊", name: "bar_chart", words: "stats data benchmark" },
      { e: "📈", name: "chart_up", words: "growth increase" },
      { e: "📉", name: "chart_down", words: "decrease drop" },
      { e: "🗂️", name: "dividers", words: "files organise" },
      { e: "📦", name: "package", words: "release box ship" },
      { e: "🧩", name: "puzzle", words: "plugin piece" },
      { e: "⚙️", name: "gear", words: "settings config" },
      { e: "🛠️", name: "tools", words: "build fix" },
      { e: "🐛", name: "bug", words: "issue error" },
      { e: "🔧", name: "wrench", words: "fix tool" },
      { e: "🔒", name: "lock", words: "security private" },
      { e: "🔑", name: "key", words: "secret access" },
      { e: "📝", name: "memo", words: "note write docs" },
      { e: "📚", name: "books", words: "docs learn read" },
      { e: "📌", name: "pin", words: "important pinned" },
      { e: "🔗", name: "link", words: "url chain" },
      { e: "📣", name: "megaphone", words: "announce" },
      { e: "🏆", name: "trophy", words: "win award" },
      { e: "🎯", name: "target", words: "goal aim" },
      { e: "⏱️", name: "stopwatch", words: "time speed fast" },
      { e: "⚡", name: "zap", words: "fast power lightning" },
      { e: "🌐", name: "globe", words: "web internet language" },
      { e: "🗣️", name: "speaking", words: "language voice talk" },
    ],
  },
  {
    label: "Symbols",
    list: [
      { e: "➡️", name: "arrow_right", words: "next" },
      { e: "⬅️", name: "arrow_left", words: "back previous" },
      { e: "⬆️", name: "arrow_up", words: "up" },
      { e: "⬇️", name: "arrow_down", words: "down download" },
      { e: "🔁", name: "repeat", words: "loop again" },
      { e: "🆕", name: "new", words: "fresh" },
      { e: "🆓", name: "free", words: "cost" },
      { e: "🟢", name: "green_circle", words: "ok online pass" },
      { e: "🟡", name: "yellow_circle", words: "pending warning" },
      { e: "🔴", name: "red_circle", words: "error offline fail" },
      { e: "🔵", name: "blue_circle", words: "info" },
      { e: "➕", name: "plus", words: "add" },
      { e: "➖", name: "minus", words: "remove" },
      { e: "♻️", name: "recycle", words: "reuse" },
      { e: "🇵🇹", name: "portugal", words: "flag pt portuguese" },
      { e: "🇧🇷", name: "brazil", words: "flag br" },
      { e: "🇪🇺", name: "eu", words: "flag europe" },
      { e: "🇺🇸", name: "usa", words: "flag us" },
      { e: "🇬🇧", name: "uk", words: "flag gb" },
    ],
  },
]

export const ALL_EMOJI: Emoji[] = EMOJI_GROUPS.flatMap((g) => g.list)

/** Best matches for a ":query" or a search box: name prefix first, then name or words containing it. */
export function findEmoji(query: string, limit = 8): Emoji[] {
  const q = query.toLowerCase().replace(/^:/, "")
  if (!q) return ALL_EMOJI.slice(0, limit)
  const starts = ALL_EMOJI.filter((x) => x.name.startsWith(q))
  const has = ALL_EMOJI.filter((x) => !x.name.startsWith(q) && (x.name.includes(q) || x.words.split(" ").some((w) => w.startsWith(q))))
  return [...starts, ...has].slice(0, limit)
}
