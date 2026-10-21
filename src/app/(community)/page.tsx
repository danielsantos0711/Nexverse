import { Suspense } from "react"
import { Hero } from "@/components/hero/hero"
import { HomeSections } from "@/components/home/home-sections"
import { BuilderWorlds, Close, Constellations, DoToday, Head, HotInForum } from "@/components/home/sections"
import { Signal, SignalSkeleton } from "@/components/home/signal"
import { RiseObserver } from "@/components/home/rise"
import { ArenaToday, MissionsToday } from "@/components/home/today-widgets"
import { TrendingBoard } from "@/components/home/trending-board"
import { LaunchOfTheDay } from "@/components/launchpad/launch-of-the-day"
import { OnlineNow } from "@/components/presence/online-now"
import { LANGUAGES } from "@/lib/data"
import { SkySection, WarpDivider } from "@/components/motion/sections"
import { DeepFieldPortal, DriftMarquee } from "@/components/home/scroll-moments"

/*
 * The home page. Under the hero (the official N in its galaxy), one focus per section, in the order and with
 * the visibility the admins set (Admin → Home page):
 *   signal          today's briefing from GitHub and arXiv, the launch of the day and news members shared
 *   trending        what members published and shared, newest first, by kind
 *   forum           the liveliest threads, and who is online now
 *   today           open missions and duels
 *   constellations  public collections members curate
 *   builders        members as planets, by reputation
 *   close           one thing to do
 * Everything the community makes is read live from the database; with nothing there yet, each section says so
 * and offers to make the first one. Nothing on this page is an example.
 *
 * Round 11 motion: each section tints the sky behind the page while it is in view (data-sky), warp dividers
 * stretch into light-speed streaks between sections, the languages drift with the scroll, and before the
 * closing band the Hubble deep field opens from a small window to the full screen (src/components/motion).
 */
export default function Home() {
  const langs = Object.values(LANGUAGES)
  const gap = "mt-24 md:mt-32"

  return (
    <>
      <RiseObserver />
      <Hero />

      {/* the languages the forum and its translations speak; scrolling pushes them along */}
      <DriftMarquee>
        <div className="marquee gap-10 pr-10 font-display text-xl text-white/25">
          {[...langs, ...langs].map((l, i) => (
            <span key={i} className="whitespace-nowrap">
              {l.native} <span className="text-ion/40">✦</span>
            </span>
          ))}
        </div>
      </DriftMarquee>

      <HomeSections
        slots={{
          signal: (
            <Suspense fallback={<SignalSkeleton />}>
              <Signal launch={<LaunchOfTheDay />} />
            </Suspense>
          ),
          trending: (
            <>
              <WarpDivider className="mt-16 md:mt-24" />
              <SkySection tone="nova" aria-labelledby="trend-h" className="shell mt-8 md:mt-10">
                <Head id="trend-h" k="home.trending" title="New in the hub" lead="Projects members published and links they shared, newest first." href="/explore" action="Explore all" />
                <TrendingBoard />
              </SkySection>
            </>
          ),
          forum: (
            <div data-sky="ion" className={gap}>
              <HotInForum online={<OnlineNow />} />
            </div>
          ),
          today: (
            <>
              <WarpDivider className="mt-16 md:mt-24" />
              <div data-sky="gold" className="mt-8 md:mt-10">
                <DoToday missions={<MissionsToday />} arena={<ArenaToday />} />
              </div>
            </>
          ),
          constellations: (
            <div data-sky="nova" className="mt-16 md:mt-24">
              <Constellations />
            </div>
          ),
          builders: (
            <div data-sky="aurora" className="mt-16 md:mt-24">
              <BuilderWorlds />
            </div>
          ),
          close: (
            <>
              <DeepFieldPortal className="mt-16 md:mt-24" />
              <div data-sky="gold">
                <Close />
              </div>
            </>
          ),
        }}
      />
    </>
  )
}
