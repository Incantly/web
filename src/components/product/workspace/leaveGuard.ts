/**
 * The browser's "Leave site? Changes you made may not be saved" prompt, registered only while
 * some edit has not reached the server. Each source (the live room, an open legacy queue)
 * reports itself under its own key; the `beforeunload` listener exists only while one is active.
 */
const active = new Set<string>()

function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault()
  // Older browsers still need a returnValue to show the prompt.
  event.returnValue = ''
}

export function setLeaveGuard(key: string, unsaved: boolean) {
  if (typeof window === 'undefined') return
  const before = active.size > 0
  if (unsaved) active.add(key)
  else active.delete(key)
  const after = active.size > 0
  if (after && !before) window.addEventListener('beforeunload', onBeforeUnload)
  else if (!after && before) window.removeEventListener('beforeunload', onBeforeUnload)
}
