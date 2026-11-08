/**
 * Liveblocks presence shape for note rooms: the local Tiptap selection as
 * document offsets (null when blurred). Peers render it as a remote caret.
 */
declare global {
  interface Liveblocks {
    Presence: {
      selection: { anchor: number; head: number } | null
    }
  }
}

export {}
