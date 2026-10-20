"use client";

import { useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
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
import { POLL_LIMITS, validatePoll, type PollInput } from "@/lib/chat-features";
import { cn } from "@/lib/utils";

const DURATIONS = [
  { hours: 0, label: "No end" },
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
];

/** Builds a poll: a question, 2 to 10 options, one answer or several, and when it closes. */
export function PollDialog({
  open,
  onOpenChange,
  initial,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: { question: string; options: string[] };
  onCreate: (poll: PollInput) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New poll</DialogTitle>
          <DialogDescription>
            Everyone in the room can vote and see who voted for what.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PollForm
            initial={initial}
            onCreate={onCreate}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PollForm({
  initial,
  onCreate,
  onDone,
}: {
  initial?: { question: string; options: string[] };
  onCreate: (poll: PollInput) => Promise<void>;
  onDone: () => void;
}) {
  const first = initial?.options?.length ? initial.options : [];
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [options, setOptions] = useState<string[]>(() =>
    first.length >= 2 ? first : [...first, "", ""].slice(0, 2),
  );
  const [multi, setMulti] = useState(false);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const onOpenChange = (o: boolean) => !o && onDone();

  async function submit() {
    const input = { question, options, multi, hours };
    const problem = validatePoll(input);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await onCreate(input);
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Question
        <Input
          autoFocus
          value={question}
          maxLength={POLL_LIMITS.question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Which model should we fine-tune first?"
        />
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Options</legend>
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              value={o}
              maxLength={POLL_LIMITS.option}
              onChange={(e) =>
                setOptions((list) =>
                  list.map((x, j) => (j === i ? e.target.value : x)),
                )
              }
              placeholder={`Option ${i + 1}`}
              aria-label={`Option ${i + 1}`}
            />
            {options.length > 2 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove option ${i + 1}`}
                onClick={() =>
                  setOptions((list) => list.filter((_, j) => j !== i))
                }
              >
                <XIcon aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {options.length < POLL_LIMITS.maxOptions && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setOptions((l) => [...l, ""])}
          >
            <PlusIcon aria-hidden /> Add an option
          </Button>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={multi}
          onChange={(e) => setMulti(e.target.checked)}
          className="size-4 accent-[var(--ion)]"
        />
        People may pick more than one
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Closes after</span>
        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label="Closes after"
        >
          {DURATIONS.map((d) => (
            <button
              key={d.hours}
              type="button"
              role="radio"
              aria-checked={hours === d.hours}
              onClick={() => setHours(d.hours)}
              className={cn(
                "pressable h-8 rounded-full border px-3 text-xs transition-colors",
                hours === d.hours
                  ? "border-ion/50 bg-ion/15 text-ion"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Posting…" : "Post poll"}
        </Button>
      </DialogFooter>
    </form>
  );
}
