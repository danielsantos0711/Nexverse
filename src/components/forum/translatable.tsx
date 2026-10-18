"use client"

import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { LanguagesIcon } from "lucide-react"
import { LANGUAGES, type LanguageCode } from "@/lib/data"
import { cn } from "@/lib/utils"

/** Shows a post in the language it was written in, with its English translation one click away. */
export function Translatable({
  lang,
  original,
  english,
  className,
}: {
  lang: LanguageCode
  original: React.ReactNode
  english?: React.ReactNode
  className?: string
}) {
  const [en, setEn] = useState(false)
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={en ? "en" : "orig"}
          lang={en ? "en" : lang}
          initial={{ opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(4px)" }}
          transition={{ duration: 0.2 }}
        >
          {en ? english : original}
        </motion.div>
      </AnimatePresence>
      {english && lang !== "en" && (
        <button type="button" onClick={() => setEn(!en)} className="inline-flex items-center gap-1.5 self-start text-xs text-ion hover:underline">
          <LanguagesIcon aria-hidden className="size-3.5" />
          {en ? `Show the original in ${LANGUAGES[lang].native}` : `Translate from ${LANGUAGES[lang].name}`}
        </button>
      )}
    </div>
  )
}
