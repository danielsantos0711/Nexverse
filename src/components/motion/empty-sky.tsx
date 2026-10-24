"use client"

import { cn } from "@/lib/utils"

/*
 * <EmptySky>: an honest empty state that still feels like the universe: a small planet with a moon in orbit and
 * a few stars that brighten under the pointer (or the finger), a plain sentence and the action that fills it.
 * Never fake content, only an invitation. Still with reduced motion. Silver and white only (launch pass).
 */
export function EmptySky({ title, body, action, className }: { title: React.ReactNode; body?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("nx-empty nx-empty-sky group relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-12 text-center", className)}>
      <div aria-hidden className="relative size-24">
        <span className="absolute inset-3 rounded-full bg-[radial-gradient(circle_at_35%_30%,#eef0f5,#5d626c_55%,#0e0f12)] shadow-[0_0_40px_-6px_rgb(235_238_245/0.35)] transition-transform duration-500 ease-(--ease-out) group-hover:scale-105" />
        <span className="nx-empty-orbit absolute inset-0 rounded-full border border-white/10">
          <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-[#eef0f5] shadow-[0_0_10px_rgb(238_240_245/0.7)]" />
        </span>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="nx-empty-star absolute size-1 rounded-full bg-white" style={{ left: `${[-30, 120, -10, 110][i]}%`, top: `${[10, 20, 90, 80][i]}%`, animationDelay: `${i * 0.7}s` }} />
        ))}
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="font-display text-base font-semibold">{title}</p>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
      {action}
    </div>
  )
}
