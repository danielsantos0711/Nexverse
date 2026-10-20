"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { CheckIcon, CircleAlertIcon, InfoIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/*
 * Toasts: one quiet line that confirms an action (saved, followed, copied) or says why it failed. Any client
 * component calls toast("Saved") with no provider; the header mounts the one <Toaster />. They stack at the
 * bottom (above the phone's tab bar, bottom right on desktop), slide in with a spring and leave on their own.
 */

export type ToastTone = "ok" | "info" | "error"
type Toast = { id: number; text: string; tone: ToastTone; action?: { label: string; run: () => void } }

let toasts: Toast[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** Show a toast. Errors stay longer; at most three are on screen. Returns its id. */
export function toast(text: string, opts: { tone?: ToastTone; action?: Toast["action"]; ms?: number } = {}) {
  const id = ++seq
  const tone = opts.tone ?? "ok"
  toasts = [...toasts.slice(-2), { id, text, tone, action: opts.action }]
  emit()
  setTimeout(() => dismissToast(id), opts.ms ?? (tone === "error" ? 6000 : 3200))
  return id
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const mounted = () => () => {}

const ICON = { ok: CheckIcon, info: InfoIcon, error: CircleAlertIcon }
const TINT = { ok: "text-ok", info: "text-ion", error: "text-destructive" }

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => toasts)
  const ready = useSyncExternalStore(mounted, () => true, () => false)
  const reduce = useReducedMotion()
  if (!ready) return null
  return createPortal(
    <ol
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] z-[60] flex flex-col items-center gap-2 px-4 lg:right-6 lg:bottom-6 lg:left-auto lg:items-end"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => {
          const Icon = ICON[t.tone]
          return (
            <motion.li
              key={t.id}
              layout={!reduce}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              role={t.tone === "error" ? "alert" : "status"}
              className="liquid-glass-strong pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-full py-2 pr-2 pl-3.5 text-sm shadow-lg"
            >
              <Icon aria-hidden className={cn("size-4 shrink-0", TINT[t.tone])} />
              <span className="min-w-0 flex-1">{t.text}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.run()
                    dismissToast(t.id)
                  }}
                  className="pressable rounded-full px-2.5 py-1 text-xs font-medium text-ion hover:bg-ion/10"
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="pressable grid size-6 place-items-center rounded-full text-muted-foreground hover:text-foreground">
                <XIcon aria-hidden className="size-3.5" />
              </button>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ol>,
    document.body
  )
}
