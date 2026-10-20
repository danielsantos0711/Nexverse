"use client"

import { useRef } from "react"
import { ExplainThis } from "@/components/ai/inline-ai"

/*
 * "Explain this result" under a Lab calculator. When pressed it reads what the tool shows right now: each field
 * as "label: value" and the visible results, so the helper explains the member's actual numbers. Nothing is sent
 * until the member asks. Hidden when AI is off (ExplainThis decides).
 */

function readTool(root: HTMLElement): string {
  const fields: string[] = []
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea").forEach((el) => {
    if (el.type === "hidden" || el.type === "password") return
    const id = el.id
    const label = (id && root.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent) || el.getAttribute("aria-label") || el.name
    let value = el instanceof HTMLSelectElement ? (el.selectedOptions[0]?.textContent ?? el.value) : el.value
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      if (el.type === "radio" && !el.checked) return
      value = el.type === "checkbox" ? (el.checked ? "on" : "off") : value
    }
    if (label && value) fields.push(`${label.trim()}: ${String(value).slice(0, 200)}`)
  })
  const shown = root.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 3000)
  return `Inputs:\n${fields.join("\n")}\n\nWhat the tool shows:\n${shown}`
}

export function ExplainTool({ tool, children }: { tool: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={ref}>{children}</div>
      <ExplainThis tool={tool} result={() => (ref.current ? readTool(ref.current) : "")} className="mt-6" />
    </>
  )
}
