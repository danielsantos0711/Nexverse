import { getContentValues } from "@/lib/content-server"
import { ContentSeedProvider } from "./seed"

/**
 * Server side of editable content: reads the admins' overrides (cached, see content-server.ts) and hands them
 * to every <Copy>, useCopy and useBlock below, so the server's HTML already has the edited text. The browser
 * then switches to the live store and follows edits as they happen.
 */
export async function ContentProvider({ children }: { children: React.ReactNode }) {
  const values = await getContentValues()
  return <ContentSeedProvider values={values}>{children}</ContentSeedProvider>
}
