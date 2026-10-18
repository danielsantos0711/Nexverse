"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { roomHref } from "@/components/chat/format"
import { RoomGlyph } from "@/components/chat/glyphs"
import { createRoom, ROOM_SLUG, slugify, type Room } from "@/lib/chat"

export function CreateRoomDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (room: Room) => void }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [topic, setTopic] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const address = slugTouched ? slug : slugify(name)
  const valid = name.trim().length >= 2 && name.trim().length <= 40 && ROOM_SLUG.test(address) && topic.length <= 200

  function reset() {
    setName("")
    setSlug("")
    setSlugTouched(false)
    setTopic("")
    setError("")
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError("")
    try {
      const room = await createRoom({ slug: address, name, topic })
      onCreated(room)
      onOpenChange(false)
      reset()
      router.push(roomHref(room.slug))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setError("")
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Open a new room</DialogTitle>
            <DialogDescription>Rooms are public: anyone can read them, and signed-in members can write.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="room-name">Name</FieldLabel>
              <div className="flex items-center gap-2">
                <RoomGlyph slug={address || "new"} active size={32} />
                <Input id="room-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Voice models" autoComplete="off" required />
              </div>
            </Field>
            <Field data-invalid={address && !ROOM_SLUG.test(address) ? true : undefined}>
              <FieldLabel htmlFor="room-slug">Address</FieldLabel>
              <div className="flex items-center rounded-lg border border-input bg-input/30 pl-3 text-sm text-muted-foreground focus-within:border-ring">
                <span aria-hidden>/chat/</span>
                <input
                  id="room-slug"
                  value={address}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40))
                  }}
                  className="h-9 min-w-0 flex-1 bg-transparent pr-3 text-foreground outline-none"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="room-slug-help"
                />
              </div>
              <FieldDescription id="room-slug-help">Lowercase letters, numbers and dashes. It can’t be changed later.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="room-topic">Topic</FieldLabel>
              <Textarea id="room-topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} rows={2} placeholder="What is this room for?" />
              <FieldDescription>{200 - topic.length} characters left</FieldDescription>
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || busy}>
              {busy ? "Opening…" : "Open room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
