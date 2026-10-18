import Link from "next/link"
import { Lockup } from "@/components/brand"

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-card px-gutter pt-14 pb-10">
      <div className="flex flex-col justify-between gap-10 sm:flex-row">
        <div className="flex max-w-sm flex-col gap-4">
          <Lockup />
          <p className="text-muted-foreground">
            A public, international community for people who build with AI.
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-8 gap-y-3">
          {[
            ["/explore", "Explore"],
            ["/orbits", "Orbits"],
            ["/signal", "Signal"],
            ["/new", "Ask a question"],
          ].map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="hover:underline">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-12 text-small text-muted-foreground">
        Every person, thread, artifact and news item shown here is sample content written to preview the
        product. None of it is real yet.
      </p>
    </footer>
  )
}
