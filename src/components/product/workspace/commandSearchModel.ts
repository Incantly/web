import type { NoteRecord, SourceRecord, SpaceRecord } from './model'

/** Shortest query that searches inside notes and files; shorter ones only match names. */
export const MIN_CONTENT_QUERY = 2
const PER_GROUP = { notes: 6, spaces: 4, sources: 6, recent: 5 }

export type CommandAction = 'new-note' | 'new-space' | 'add-source' | 'settings'

export type CommandItem =
  | { kind: 'content'; id: 'content'; query: string }
  | { kind: 'note'; id: string; note: NoteRecord }
  | { kind: 'space'; id: string; space: SpaceRecord }
  | { kind: 'source'; id: string; source: SourceRecord }
  | { kind: 'ask'; id: 'ask'; query: string }
  | { kind: 'action'; id: string; action: CommandAction; label: string }

export type CommandGroup = { id: string; label: string; items: CommandItem[] }

export const commandActions: { action: CommandAction; label: string; keywords: string }[] = [
  { action: 'new-note', label: 'New note', keywords: 'new note create write' },
  { action: 'new-space', label: 'New Space', keywords: 'new space create folder' },
  { action: 'add-source', label: 'Add to Library', keywords: 'add library source upload file import' },
  { action: 'settings', label: 'Settings', keywords: 'settings preferences account usage shortcuts' },
]

/**
 * How well a name matches: 0 for no match, higher is better. A name that starts with the query beats
 * one with a word starting with it, which beats a match anywhere. Every query word must appear.
 */
export function matchScore(name: string, query: string): number {
  const text = name.toLowerCase()
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  let score = 0
  for (const word of words) {
    const at = text.indexOf(word)
    if (at < 0) return 0
    score += at === 0 ? 3 : /[\s\-_./(]/.test(text[at - 1]) ? 2 : 1
  }
  return score
}

function ranked<T>(items: T[], name: (item: T) => string, query: string, limit: number): T[] {
  return items
    .map((item) => ({ item, score: matchScore(name(item), query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item)
}

/**
 * What ⌘K shows. With no query: recent notes and the actions. With one: a row to search inside notes
 * and files (it only runs on Enter), name matches from data already loaded, then "Ask AI" and the
 * matching actions. Nothing here calls the backend.
 */
export function commandGroups(query: string, data: { notes: NoteRecord[]; spaces: SpaceRecord[]; sources: SourceRecord[] }): CommandGroup[] {
  const text = query.trim()
  const actions = (filter: string) => commandActions
    .filter((entry) => !filter || matchScore(`${entry.label} ${entry.keywords}`, filter) > 0)
    .map<CommandItem>((entry) => ({ kind: 'action', id: `action:${entry.action}`, action: entry.action, label: entry.label }))

  if (!text) {
    const recent = [...data.notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, PER_GROUP.recent)
    const groups: CommandGroup[] = [
      { id: 'recent', label: 'Recent notes', items: recent.map<CommandItem>((note) => ({ kind: 'note', id: `note:${note.id}`, note })) },
      { id: 'actions', label: 'Actions', items: actions('') },
    ]
    return groups.filter((group) => group.items.length)
  }

  const groups: CommandGroup[] = []
  if (text.length >= MIN_CONTENT_QUERY) groups.push({ id: 'content', label: 'Search', items: [{ kind: 'content', id: 'content', query: text }] })
  groups.push(
    { id: 'notes', label: 'Notes', items: ranked(data.notes, (note) => note.title || 'Untitled note', text, PER_GROUP.notes).map<CommandItem>((note) => ({ kind: 'note', id: `note:${note.id}`, note })) },
    { id: 'spaces', label: 'Spaces', items: ranked(data.spaces, (space) => space.name, text, PER_GROUP.spaces).map<CommandItem>((space) => ({ kind: 'space', id: `space:${space.id}`, space })) },
    { id: 'sources', label: 'Library', items: ranked(data.sources, (source) => source.title, text, PER_GROUP.sources).map<CommandItem>((source) => ({ kind: 'source', id: `source:${source.id}`, source })) },
    { id: 'actions', label: 'Actions', items: [...(text.length >= MIN_CONTENT_QUERY ? [{ kind: 'ask', id: 'ask', query: text } as CommandItem] : []), ...actions(text)] },
  )
  return groups.filter((group) => group.items.length)
}

/** The next highlighted row for ↑/↓, wrapping at both ends. */
export function moveActive(index: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return 0
  return (index + delta + count) % count
}
