import { createElement } from "react"
import {
  BotIcon,
  BoxIcon,
  CpuIcon,
  DatabaseIcon,
  EarthIcon,
  FlaskConicalIcon,
  GaugeIcon,
  GlobeIcon,
  LanguagesIcon,
  LifeBuoyIcon,
  MegaphoneIcon,
  MessagesSquareIcon,
  ScaleIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"

const ICONS: Record<string, LucideIcon> = {
  megaphone: MegaphoneIcon,
  "life-buoy": LifeBuoyIcon,
  sparkles: SparklesIcon,
  box: BoxIcon,
  bot: BotIcon,
  cpu: CpuIcon,
  database: DatabaseIcon,
  "flask-conical": FlaskConicalIcon,
  gauge: GaugeIcon,
  scale: ScaleIcon,
  languages: LanguagesIcon,
  globe: GlobeIcon,
  earth: EarthIcon,
}

export const categoryIcon = (name: string) => ICONS[name] ?? MessagesSquareIcon

/** A category's icon as an element, decorative (the category's name always sits next to it). */
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  return createElement(categoryIcon(name), { "aria-hidden": true, className })
}
