"use client"

import { NexverseEditor } from "@/components/editor/editor"

/**
 * The README editor: the Nexverse editor in its full form (headings menu, split preview, focus mode). Kept as a
 * thin wrapper so the studio's forms keep their props. The preview uses the shared safe renderer: no raw HTML
 * ever reaches the page.
 */
export function MarkdownEditor({
  id,
  value,
  onChange,
  maxLength,
  invalid,
  describedBy,
  placeholder,
  draftKey,
  title,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  maxLength: number
  invalid?: boolean
  describedBy?: string
  placeholder?: string
  draftKey?: string | null
  title?: string
}) {
  return (
    <NexverseEditor
      id={id}
      value={value}
      onChange={onChange}
      maxLength={maxLength}
      invalid={invalid}
      describedBy={describedBy}
      placeholder={placeholder}
      draftKey={draftKey}
      title={title}
      mentions={false}
      variant="full"
    />
  )
}
