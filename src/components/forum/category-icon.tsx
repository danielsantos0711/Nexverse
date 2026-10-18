import { BotIcon, BoxIcon, CpuIcon, FlaskConicalIcon, LanguagesIcon, LifeBuoyIcon, MessagesSquareIcon, ScaleIcon, SparklesIcon, type LucideIcon } from "lucide-react"

const ICONS: Record<string, LucideIcon> = {
  "life-buoy": LifeBuoyIcon,
  sparkles: SparklesIcon,
  box: BoxIcon,
  bot: BotIcon,
  languages: LanguagesIcon,
  cpu: CpuIcon,
  "flask-conical": FlaskConicalIcon,
  scale: ScaleIcon,
}

export const categoryIcon = (name: string) => ICONS[name] ?? MessagesSquareIcon
