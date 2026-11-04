import { redirect } from 'next/navigation'

/**
 * The guide's thread-link shape (`/notes/{noteId}?thread={threadId}`, from
 * email "View comment" buttons): folds it into the workspace URL
 * (`/notes?note={noteId}&thread={threadId}`), which opens the note and
 * highlights the thread in the comments panel.
 */
export default async function NoteRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ noteId: string }>
  searchParams: Promise<{ thread?: string }>
}) {
  const { noteId } = await params
  const { thread } = await searchParams
  const query = new URLSearchParams({ note: noteId })
  if (thread) query.set('thread', thread)
  redirect(`/notes?${query}`)
}
