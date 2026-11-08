import type { Editor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/** One remote collaborator's selection, as broadcast over Liveblocks presence. */
export type RemoteSelection = {
  /** Stable per-connection key (the Liveblocks connection ID). */
  key: string
  anchor: number
  head: number
  /** Display name; untrusted text, rendered via textContent only. */
  name: string | null
  /** Opaque palette color for the caret flag and selection tint. */
  color: string
}

export const REMOTE_PRESENCE_KEY = new PluginKey<DecorationSet>('incantlyRemotePresence')

/** Distinct caret colors, assigned by hashing the connection ID. */
const REMOTE_PRESENCE_COLORS = [
  '#2b62d9', '#7c3aed', '#059669', '#dc2626', '#d97706', '#0891b2', '#db2777', '#4d7c0f',
]

export function remotePresenceColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0
  return REMOTE_PRESENCE_COLORS[Math.abs(hash) % REMOTE_PRESENCE_COLORS.length]!
}

/**
 * Builds the decoration set for remote selections. Positions come from peers
 * whose document may have diverged from ours, so every position is clamped
 * into the local document and out-of-range selections are dropped: a remote
 * caret is always an approximation, never a crash.
 */
export function buildRemoteDecorations(doc: { content: { size: number } }, remotes: readonly RemoteSelection[]): DecorationSet {
  const max = doc.content.size
  const decorations: Decoration[] = []
  for (const remote of remotes) {
    const anchor = Math.min(Math.max(0, Math.floor(remote.anchor)), max)
    const head = Math.min(Math.max(0, Math.floor(remote.head)), max)
    if (!Number.isFinite(anchor) || !Number.isFinite(head)) continue
    const from = Math.min(anchor, head)
    const to = Math.max(anchor, head)
    if (to > from) {
      decorations.push(Decoration.inline(from, to, {
        class: 'incantly-remote-selection',
        style: `background-color: ${remote.color}2e`,
      }))
    }
    decorations.push(Decoration.widget(head, () => {
      const caret = document.createElement('span')
      caret.className = 'incantly-remote-caret'
      caret.style.borderLeftColor = remote.color
      // Names are untrusted: textContent, never innerHTML.
      if (remote.name) {
        const flag = document.createElement('span')
        flag.className = 'incantly-remote-caret__flag'
        flag.style.backgroundColor = remote.color
        flag.textContent = remote.name
        caret.appendChild(flag)
      }
      caret.setAttribute('aria-hidden', 'true')
      return caret
    }, { side: 1, key: `remote-caret-${remote.key}` }))
  }
  // DecorationSet.create needs a real doc; callers always pass editor.state.doc.
  return DecorationSet.create(doc as Parameters<typeof DecorationSet.create>[0], decorations)
}

/** Replaces the remote-selection decorations (a no-op history entry). */
export function setRemoteSelections(editor: Editor, remotes: readonly RemoteSelection[]): void {
  if (editor.isDestroyed) return
  const set = buildRemoteDecorations(editor.state.doc, remotes)
  editor.view.dispatch(editor.state.tr.setMeta(REMOTE_PRESENCE_KEY, set).setMeta('addToHistory', false))
}

/**
 * Renders remote collaborators' carets and selections as decorations.
 * The React side owns the data (Liveblocks `others`) and pushes new sets
 * through `setRemoteSelections`; the plugin only holds the set and maps it
 * across local document changes.
 */
export const RemotePresence = Extension.create({
  name: 'incantlyRemotePresence',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: REMOTE_PRESENCE_KEY,
        state: {
          init: () => DecorationSet.empty,
          apply: (transaction, previous) => {
            const replacement = transaction.getMeta(REMOTE_PRESENCE_KEY) as DecorationSet | undefined
            if (replacement) return replacement
            return transaction.docChanged ? previous.map(transaction.mapping, transaction.doc) : previous
          },
        },
        props: {
          decorations: (state) => REMOTE_PRESENCE_KEY.getState(state) ?? DecorationSet.empty,
        },
      }),
    ]
  },
})
