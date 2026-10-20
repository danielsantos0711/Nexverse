"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { CheckIcon, SparklesIcon } from "lucide-react";
import { AiErrorText, AiLabel } from "@/components/ai/ai-bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GlassKeys } from "@/components/glass/glass-keys";
import { EmojiPicker } from "@/components/chat/emoji-picker";
import { ai, type ThreadSummaryResult } from "@/lib/ai-client";
import {
  ACCENT_VALUE,
  ROOM_ACCENTS,
  styleRoom,
  type ChatMessage,
  type Room,
  type RoomAccent,
} from "@/lib/chat";
import { cn } from "@/lib/utils";

const SiriWave = dynamic(() => import("@/components/chat/siri-wave"), {
  ssr: false,
});

/**
 * "Catch me up": the messages since you last read (or the latest 80), summarised by the site's free AI. Only
 * offered when AI is switched on; the result is marked as AI-written.
 */
export function CatchUpDialog({
  open,
  onOpenChange,
  room,
  messages,
  since,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  room: string;
  messages: ChatMessage[];
  since: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon aria-hidden className="size-4 text-ion" /> Catch me up
          </DialogTitle>
          <DialogDescription>
            {since
              ? "What happened in this room since you last read it."
              : "What this room has been talking about lately."}
          </DialogDescription>
        </DialogHeader>
        {open && <CatchUpBody room={room} messages={messages} since={since} />}
      </DialogContent>
    </Dialog>
  );
}

function CatchUpBody({
  room,
  messages,
  since,
}: {
  room: string;
  messages: ChatMessage[];
  since: string | null;
}) {
  const [picked] = useState(() => {
    const list = messages.filter((m) => !m.status && m.kind !== "sticker");
    const unread = since ? list.filter((m) => m.createdAt > since) : [];
    return (unread.length >= 3 ? unread : list).slice(-80);
  });
  const [result, setResult] = useState<ThreadSummaryResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(picked.length >= 2);

  useEffect(() => {
    if (picked.length < 2) return;
    const ctl = new AbortController();
    ai.threadSummary(
      {
        title: `Chat room ${room}`,
        posts: picked.map((m) => ({
          author: m.author?.name ?? "A member",
          body: m.kind === "poll" ? `Poll: ${m.body}` : m.body.slice(0, 600),
        })),
      },
      ctl.signal,
    )
      .then((r) => setResult(r.data))
      .catch((e: Error) => e.name !== "AbortError" && setError(e))
      .finally(() => setBusy(false));
    return () => ctl.abort();
  }, [picked, room]);

  if (picked.length < 2)
    return (
      <p className="text-sm text-muted-foreground">
        There is not enough here to summarise yet.
      </p>
    );
  if (busy)
    return (
      <div className="flex flex-col items-center gap-2 py-2" role="status">
        <div className="relative h-20 w-full overflow-hidden rounded-xl">
          <SiriWave active />
        </div>
        <p className="text-sm text-muted-foreground">Reading the room…</p>
      </div>
    );
  if (error) return <AiErrorText error={error} />;
  if (!result) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed">{result.tldr}</p>
      {result.points?.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-foreground/90">
          {result.points.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      <AiLabel>
        Written by AI from {result.postsRead} messages. It can miss things.
      </AiLabel>
    </div>
  );
}

/** A room's look, for chat managers (public rooms) and a crew's captain and officers (its room). */
export function RoomStyleDialog({
  open,
  onOpenChange,
  room,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  room: Room;
  onSaved: (r: Room) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Room look</DialogTitle>
          <DialogDescription>
            The colour, emoji, topic and rules everyone sees in {room.name}.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <StyleForm
            room={room}
            onSaved={onSaved}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StyleForm({
  room,
  onSaved,
  onClose,
}: {
  room: Room;
  onSaved: (r: Room) => void;
  onClose: () => void;
}) {
  const [accent, setAccent] = useState<RoomAccent | null>(room.accent ?? null);
  const [emoji, setEmoji] = useState(room.emoji ?? "");
  const [topic, setTopic] = useState(room.topic);
  const [rules, setRules] = useState(room.rules ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await styleRoom(room.slug, { accent, emoji, rules, topic });
      onSaved({
        ...room,
        accent,
        emoji: emoji.trim() || null,
        rules: rules.trim(),
        topic: topic.trim() || room.topic,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Colour</legend>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="Colour"
          >
            <Swatch
              label="Default"
              on={accent === null}
              onClick={() => setAccent(null)}
              color="transparent"
            />
            {ROOM_ACCENTS.map((a) => (
              <Swatch
                key={a}
                label={a}
                on={accent === a}
                onClick={() => setAccent(a)}
                color={ACCENT_VALUE[a]}
              />
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Emoji</span>
          <EmojiPicker
            side="bottom"
            align="start"
            onPick={setEmoji}
            trigger={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Pick the room's emoji"
              >
                <span className="text-base">{emoji || "＋"}</span>
              </Button>
            }
          />
          {emoji && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setEmoji("")}
            >
              Remove
            </Button>
          )}
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Topic
          <Input
            value={topic}
            maxLength={200}
            onChange={(e) => setTopic(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Rules banner
          <Textarea
            value={rules}
            maxLength={1500}
            rows={4}
            onChange={(e) => setRules(e.target.value)}
            placeholder="Shown once at the top of the room, until each member closes it."
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

function Swatch({
  label,
  on,
  onClick,
  color,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ background: color }}
      className={cn(
        "pressable grid size-8 place-items-center rounded-full border transition-shadow",
        on
          ? "border-foreground shadow-[0_0_0_3px_rgb(255_255_255/0.15)]"
          : "border-white/20",
        color === "transparent" &&
          "bg-[conic-gradient(var(--ion),var(--gold),var(--ok),var(--ion))]",
      )}
    >
      {on && (
        <CheckIcon
          aria-hidden
          className="size-4 text-black mix-blend-difference"
        />
      )}
    </button>
  );
}

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Alt", "↑"], label: "Previous room" },
  { keys: ["Alt", "↓"], label: "Next room" },
  { keys: ["Alt", "⇧", "↓"], label: "Next room with unread messages" },
  { keys: ["/"], label: "Write a message (or a command)" },
  { keys: ["↑"], label: "Edit your last message (empty box)" },
  { keys: ["Esc"], label: "Cancel a reply, close a panel" },
  { keys: ["Alt", "F"], label: "Search this room" },
  { keys: ["Alt", "P"], label: "Pinned messages" },
  { keys: ["Alt", "S"], label: "Saved messages" },
  { keys: ["⇧", "Esc"], label: "Mark the room read, jump to the latest" },
  { keys: ["?"], label: "This list" },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Fly through the rooms without leaving the keyboard.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y divide-border">
          {SHORTCUTS.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span>{s.label}</span>
              <GlassKeys keys={s.keys} live={open} />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
