import { getAttendees as getAttendeesAll, getAttendeesMany as getAttendeesManyAll, getEvent as getEventAll, listEvents as listEventsAll, type Attendees, type CommunityEvent } from "@/lib/community"

/**
 * Events as the events pages see them: only real ones. The event data and RSVPs live in lib/community.ts, which
 * still ships a few built-in example events; this module filters those out (and anything tied to them, such as
 * pre-filled attendee lists), so the pages show members' events from the database, or the ones you created in
 * this browser when there is no database. Everything else (validation, creating, RSVPs, calendar files) is
 * imported straight from lib/community.ts.
 */

const isReal = (e: CommunityEvent) => !(e as { sample?: boolean }).sample

/** Members' events (from the database, or from this browser), soonest first. */
export async function listEvents(): Promise<CommunityEvent[]> {
  return (await listEventsAll()).filter(isReal)
}

/** One member's event, or null when it does not exist (or is one of the built-in examples). */
export async function getEvent(id: string): Promise<CommunityEvent | null> {
  const e = await getEventAll(id)
  return e && isReal(e) ? e : null
}

/** Who is going and interested, without any pre-filled example names. */
export async function getAttendees(e: CommunityEvent): Promise<Attendees> {
  return getAttendeesAll({ ...e, seedGoing: [], seedInterested: [] })
}

export async function getAttendeesMany(events: CommunityEvent[]): Promise<Record<string, Attendees>> {
  return getAttendeesManyAll(events.map((e) => ({ ...e, seedGoing: [], seedInterested: [] })))
}
