import Link from "next/link"
import { FlameIcon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { Item, Stagger } from "@/components/hub/motion"
import { storyHref, type CategoryNames } from "@/lib/newsroom"
import { risingStories } from "@/lib/newsroom/public"
import { CategoryTag, StoryCover, storyDate } from "./bits"

/*
 * "Rising in Nexverse news": the newsroom's own stories readers are opening most these three days (anonymous
 * read counts), with recent high-impact stories filling in while counts are low. Nexverse stories only.
 */
export async function RisingNews({ names }: { names: CategoryNames }) {
  const rising = await risingStories(5)
  if (rising.length < 2) return null
  return (
    <section aria-labelledby="rising-h" className="relative isolate overflow-hidden rounded-[2rem] border border-border bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,170,90,0.08),transparent_55%),radial-gradient(90%_90%_at_100%_100%,rgba(122,162,255,0.08),transparent_60%)] p-5 md:p-8">
      <h2 id="rising-h" className="flex items-center gap-2 text-xl font-semibold md:text-2xl">
        <FlameIcon aria-hidden className="size-5 text-gold" />
        <Copy k="news.rising.title">Rising in Nexverse news</Copy>
      </h2>
      <Copy k="news.rising.lead" as="p" className="mt-1 text-sm text-muted-foreground">
        The newsroom stories readers are opening most right now.
      </Copy>
      <Stagger as="ol" className="mt-6 grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-5" gap={0.06}>
        {rising.map(({ story, reads }, i) => (
          <Item as="li" key={story.id} className="group relative flex gap-3 xl:flex-col">
            <span aria-hidden className="font-display text-4xl leading-none font-semibold text-white/15 tabular-nums transition-colors group-hover:text-gold/70 xl:text-5xl">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="relative hidden aspect-[16/9] overflow-hidden rounded-xl xl:block">
                <StoryCover story={story} className="transition-transform duration-700 group-hover:scale-105 motion-reduce:transform-none" />
              </div>
              <CategoryTag category={story.category} label={names[story.category]?.one} />
              <Link href={storyHref(story)} className="line-clamp-3 font-medium leading-snug after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
                {story.title}
              </Link>
              <p className="text-xs text-muted-foreground">
                {storyDate(story.publishedAt)}
                {reads > 0 ? ` · ${reads.toLocaleString("en-US")} ${reads === 1 ? "read" : "reads"}` : ""}
              </p>
            </div>
          </Item>
        ))}
      </Stagger>
    </section>
  )
}
