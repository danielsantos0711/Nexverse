import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Sora } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import { rootMetadata } from "@/lib/content-server"
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css"

const geist = Geist({ variable: "--font-geist", subsets: ["latin", "latin-ext"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })
const sora = Sora({ variable: "--font-sora", subsets: ["latin", "latin-ext"] })

const DEFAULT_TITLE = "Nexverse: the open universe for AI builders"
const DEFAULT_DESCRIPTION =
  "Models, datasets, tools, repos, news and a forum in every language. Find what people are building with AI, share yours, and connect it into constellations."

// The admins' SEO for the home page (site editor, "seo./") and the brand name from site settings, cached.
export async function generateMetadata(): Promise<Metadata> {
  const meta = await rootMetadata({ title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION })
  return { ...meta, icons: { icon: "/favicon.ico", apple: "/apple-icon.png" } }
}

export const viewport: Viewport = { themeColor: "#05060a" }

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${sora.variable} dark h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <TooltipProvider>{children}</TooltipProvider>
        <SpeedInsights />
      </body>
    </html>
  )
}
