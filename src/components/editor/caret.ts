/**
 * Where the caret of a textarea is on screen, relative to the textarea's box, using a hidden mirror element
 * with the same text styles. Used to open the "/", "@" and ":" menus right under what is being typed.
 */

const COPY = [
  "boxSizing", "width", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "lineHeight", "fontFamily", "textAlign", "textTransform", "textIndent", "letterSpacing", "wordSpacing", "tabSize",
] as const

export function caretCoords(el: HTMLTextAreaElement, pos: number): { top: number; left: number; height: number } {
  const div = document.createElement("div")
  const style = getComputedStyle(el)
  for (const p of COPY) div.style[p] = style[p]
  div.style.position = "absolute"
  div.style.visibility = "hidden"
  div.style.whiteSpace = "pre-wrap"
  div.style.overflowWrap = "break-word"
  div.style.top = "0"
  div.style.left = "-9999px"
  div.textContent = el.value.slice(0, pos)
  const span = document.createElement("span")
  span.textContent = el.value.slice(pos) || "."
  div.appendChild(span)
  document.body.appendChild(div)
  const lh = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5
  const out = { top: span.offsetTop - el.scrollTop, left: Math.min(span.offsetLeft, el.clientWidth - 24), height: lh }
  div.remove()
  return out
}
