import type { Metadata } from "next"
import { LostInSpace } from "@/components/site/lost-in-space"

export const metadata: Metadata = { title: "Page not found", robots: { index: false } }

/** A missing page inside the site: the community layout already draws the header, so this is only the message. */
export default function CommunityNotFound() {
  return <LostInSpace />
}
