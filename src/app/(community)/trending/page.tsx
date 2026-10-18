import type { Metadata } from "next"
import { Suspense } from "react"
import { PageTitle, SectionHead } from "@/components/hub/bits"
import { Item, Stagger } from "@/components/hub/motion"
import { FeedMeta, FeedUnavailable } from "@/components/live/bits"
import { GitHubRepoCard } from "@/components/live/github-repo-card"
import { HnStoryRow } from "@/components/live/hn-story-row"
import { LiveModelList } from "@/components/live/live-model-list"
import { CardsSkeleton, RowsSkeleton, StripSkeleton } from "@/components/live/skeletons"
import { SpaceCard } from "@/components/live/space-card"
import { TrendingNowLive } from "@/components/live/trending-now"
import { githubTrendingAi, hfTrending, hnAiStories } from "@/lib/live"

export const metadata: Metadata = {
  title: "Trending",
  description: "Live: the models, datasets, Spaces, repositories and discussions the open AI ecosystem is paying attention to right now.",
}

const SECTIONS = [
  { id: "models", label: "Models" },
  { id: "spaces", label: "Spaces" },
  { id: "datasets", label: "Datasets" },
  { id: "repos", label: "GitHub" },
  { id: "discussions", label: "Discussions" },
] as const

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="scroll-mt-24 border-t border-border pt-10">
      <SectionHead id={`${id}-title`} title={title}>
        <p className="text-sm text-muted-foreground">{lead}</p>
      </SectionHead>
      {children}
    </section>
  )
}

async function HubModels({ kind }: { kind: "model" | "dataset" }) {
  const feed = await hfTrending(kind, kind === "model" ? 12 : 8)
  const href = kind === "model" ? "https://huggingface.co/models?sort=trending" : "https://huggingface.co/datasets?sort=trending"
  return (
    <div className="flex flex-col gap-4">
      <FeedMeta feed={feed} href={href} />
      {feed.items.length ? <LiveModelList items={feed.items} /> : <FeedUnavailable source="huggingface" href={href} />}
    </div>
  )
}

async function Spaces() {
  const feed = await hfTrending("space", 9)
  const href = "https://huggingface.co/spaces?sort=trending"
  return (
    <div className="flex flex-col gap-4">
      <FeedMeta feed={feed} href={href} />
      {feed.items.length ? (
        <Stagger as="ul" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {feed.items.map((s) => (
            <Item as="li" key={s.id}>
              <SpaceCard space={s} />
            </Item>
          ))}
        </Stagger>
      ) : (
        <FeedUnavailable source="huggingface" href={href} />
      )}
    </div>
  )
}

async function Repos() {
  const feed = await githubTrendingAi(9)
  const href = "https://github.com/topics/llm"
  return (
    <div className="flex flex-col gap-4">
      <FeedMeta feed={feed} href={href} label="Browse #llm on GitHub" />
      {feed.items.length ? (
        <Stagger as="ol" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {feed.items.map((r, i) => (
            <Item as="li" key={r.fullName}>
              <GitHubRepoCard repo={r} rank={i + 1} />
            </Item>
          ))}
        </Stagger>
      ) : (
        <FeedUnavailable source="github" href={href} />
      )}
    </div>
  )
}

async function Discussions() {
  const feed = await hnAiStories(12)
  const href = "https://news.ycombinator.com"
  return (
    <div className="flex flex-col gap-4">
      <FeedMeta feed={feed} href={href} />
      {feed.items.length ? (
        <Stagger as="ol" className="glass flex flex-col divide-y divide-border overflow-hidden rounded-2xl" gap={0.04}>
          {feed.items.map((s) => (
            <Item as="li" key={s.id}>
              <HnStoryRow story={s} className="rounded-none" />
            </Item>
          ))}
        </Stagger>
      ) : (
        <FeedUnavailable source="hackernews" href={href} />
      )}
    </div>
  )
}

export default function TrendingPage() {
  return (
    <div className="shell pb-16">
      <PageTitle
        eyebrow="Live from Hugging Face, GitHub and Hacker News"
        title="Trending across the open ecosystem"
        lead="The models, Spaces, datasets, repositories and conversations builders are paying attention to right now. Refreshed through the day, straight from the source."
      >
        <nav aria-label="Sections" className="mt-1 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="glass rounded-full px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {s.label}
            </a>
          ))}
        </nav>
      </PageTitle>

      <div className="mb-10">
        <Suspense fallback={<StripSkeleton />}>
          <TrendingNowLive />
        </Suspense>
      </div>

      <div className="flex flex-col gap-14">
        <Section id="models" title="Trending models" lead="Ranked by Hugging Face's trending score: likes and downloads, weighted toward the last few days.">
          <Suspense fallback={<RowsSkeleton rows={12} />}>
            <HubModels kind="model" />
          </Suspense>
        </Section>
        <Section id="spaces" title="Trending Spaces" lead="Demos and apps you can try in the browser, most of them free.">
          <Suspense fallback={<CardsSkeleton cards={9} />}>
            <Spaces />
          </Suspense>
        </Section>
        <Section id="datasets" title="Trending datasets" lead="The data people are downloading and building on this week.">
          <Suspense fallback={<RowsSkeleton rows={8} />}>
            <HubModels kind="dataset" />
          </Suspense>
        </Section>
        <Section id="repos" title="Rising on GitHub" lead="New open-source AI repositories from the last 30 days, most starred first.">
          <Suspense fallback={<CardsSkeleton cards={6} />}>
            <Repos />
          </Suspense>
        </Section>
        <Section id="discussions" title="Discussed on Hacker News" lead="The AI stories with the most points over the last three days.">
          <Suspense fallback={<RowsSkeleton rows={6} columns={1} />}>
            <Discussions />
          </Suspense>
        </Section>
      </div>
    </div>
  )
}
