import type { Metadata, Viewport } from "next"
import { Archivo } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
})

export const metadata: Metadata = {
  title: {
    default: "Nexverse: ask, answer and build AI together",
    template: "%s · Nexverse",
  },
  description:
    "A public, international community for people who build with AI. Ask in your own language, get answers from people who have done it, and share back what you build.",
  icons: { icon: "/favicon.ico", apple: "/apple-icon.png" },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08090d" },
    { media: "(prefers-color-scheme: light)", color: "#f1f3f4" },
  ],
}

// Runs before paint so the stored or system theme never flashes the wrong ground.
const themeScript = `try{var t=localStorage.getItem("nexverse-theme");var d=t?t==="dark":!matchMedia("(prefers-color-scheme: light)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}`

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} dark h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
