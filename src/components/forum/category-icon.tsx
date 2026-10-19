import { createElement } from "react"
import { iconFor } from "@/components/site/icons"

/** A category's icon component, by its lucide name. Unknown names fall back to a speech bubble. */
export const categoryIcon = (name: string) => iconFor(name)

/** A category's icon as an element, decorative (the category's name always sits next to it). */
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  return createElement(categoryIcon(name), { "aria-hidden": true, className })
}
