"use client"

import { NexverseEditor } from "@/components/editor/editor"
import type { MentionCandidate } from "@/lib/community"

/**
 * The editor for posts and replies everywhere (forum, crews, events, missions, launches, code issues): the
 * Nexverse editor in its compact form. Same props as before, so every form that used the old composer gets the
 * toolbar, "/" commands, @mentions, emoji, pictures, embeds, preview and autosaved drafts. Mentions of members
 * are reported through `onMention`, so the post can carry their ids (the database only notifies members whose
 * name is still in the text).
 */
export function MarkdownComposer({
  id,
  value,
  onChange,
  label,
  placeholder,
  rows = 6,
  maxLength = 20000,
  invalid,
  describedBy,
  participants = [],
  onMention,
  onSubmit,
  mentions = true,
  autoFocus,
  draftKey,
  images = true,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  /** Accessible name for the text area when no visible <label htmlFor={id}> is used. */
  label?: string
  placeholder?: string
  rows?: number
  maxLength?: number
  invalid?: boolean
  describedBy?: string
  /** People already in the conversation, suggested first. */
  participants?: MentionCandidate[]
  onMention?: (c: MentionCandidate) => void
  /** Ctrl/Cmd+Enter. */
  onSubmit?: () => void
  mentions?: boolean
  autoFocus?: boolean
  /** Where the draft is kept; by default one per page and box. null turns autosave off. */
  draftKey?: string | null
  images?: boolean
}) {
  return (
    <NexverseEditor
      id={id}
      value={value}
      onChange={onChange}
      label={label}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      invalid={invalid}
      describedBy={describedBy}
      participants={participants}
      onMention={onMention}
      onSubmit={onSubmit}
      mentions={mentions}
      autoFocus={autoFocus}
      draftKey={draftKey}
      images={images}
      variant="compact"
    />
  )
}
