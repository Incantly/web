import { useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import type { Room } from '@liveblocks/client'
import {
  remotePresenceColor,
  setRemoteSelections,
  type RemoteSelection,
} from '@/lib/document-editor/remotePresence'

/**
 * Broadcasts the local selection to the room and renders remote selections.
 *
 * - Broadcast: every Tiptap `selectionUpdate` pushes `{ anchor, head }` into
 *   Liveblocks presence (the client throttles to one send per 50 ms); blur
 *   clears it. Positions are document offsets, so a peer renders the caret at
 *   the same passage once the documents converge.
 * - Render: the room's `others` list maps to caret + selection decorations.
 *   Names come from Liveblocks user info and render as text only.
 *
 * No room (saved-sync-only, idle-left, hidden tab) means no presence in
 * either direction; the decorations clear when the room leaves.
 */
export function useSelectionPresence(editor: Editor | null, room: Room | null): void {
  // Broadcast the local selection.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !room) return
    const push = () => {
      if (room.getStatus() !== 'connected') return
      try {
        const selection = editor.state.selection
        room.updatePresence({
          selection: editor.isFocused
            ? { anchor: selection.anchor, head: selection.head }
            : null,
        })
      } catch {
        // Presence is best-effort: a failed push never breaks editing.
      }
    }
    push()
    editor.on('selectionUpdate', push)
    editor.on('blur', push)
    return () => {
      editor.off('selectionUpdate', push)
      editor.off('blur', push)
    }
  }, [editor, room])

  // Render remote selections.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !room) {
      if (editor && !editor.isDestroyed) setRemoteSelections(editor, [])
      return
    }
    const render = () => {
      try {
        const remotes: RemoteSelection[] = []
        for (const other of room.getOthers()) {
          const selection = other.presence?.selection
          if (!selection || typeof selection.anchor !== 'number' || typeof selection.head !== 'number') continue
          const key = String(other.connectionId)
          const info = (other.info ?? {}) as { name?: unknown }
          remotes.push({
            key,
            anchor: selection.anchor,
            head: selection.head,
            name: typeof info.name === 'string' && info.name.trim() ? info.name.trim().slice(0, 40) : null,
            color: remotePresenceColor(key),
          })
        }
        setRemoteSelections(editor, remotes)
      } catch {
        // A malformed peer payload clears nothing and breaks nothing.
      }
    }
    render()
    const unsubscribe = room.subscribe('others', render)
    return () => {
      unsubscribe()
      setRemoteSelections(editor, [])
    }
  }, [editor, room])
}
