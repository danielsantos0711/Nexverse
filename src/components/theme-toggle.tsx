"use client"

import { MoonIcon, SunIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  function toggle() {
    const dark = !document.documentElement.classList.contains("dark")
    document.documentElement.classList.toggle("dark", dark)
    try {
      localStorage.setItem("nexverse-theme", dark ? "dark" : "light")
    } catch {}
  }
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Switch between graphite and pearl">
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="block dark:hidden" />
    </Button>
  )
}
