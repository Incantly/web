/** One run of a word diff: text both versions share, text only the old one has, or text only the new one has. */
export type DiffPart = { kind: 'same' | 'removed' | 'added'; text: string }

/** Words and the whitespace between them, so a diff never splits a word. */
function tokens(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? []
}

// Past this many token pairs the table gets slow; the middle shows as one removal and one addition.
const MAX_CELLS = 250_000

function push(parts: DiffPart[], kind: DiffPart['kind'], text: string) {
  if (!text) return
  const last = parts.at(-1)
  if (last?.kind === kind) last.text += text
  else parts.push({ kind, text })
}

/**
 * A word-level diff of `before` and `after` (longest common subsequence over words and
 * whitespace). Joining the `same` and `removed` parts gives `before` back; `same` and `added`
 * give `after`. Removals come before additions where both replace the same words.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokens(before)
  const b = tokens(after)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }

  const parts: DiffPart[] = []
  push(parts, 'same', a.slice(0, start).join(''))
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  if (midA.length * midB.length > MAX_CELLS) {
    push(parts, 'removed', midA.join(''))
    push(parts, 'added', midB.join(''))
  } else {
    // lengths[i][j]: the longest common run of midA[i..] and midB[j..].
    const lengths = Array.from({ length: midA.length + 1 }, () => new Array<number>(midB.length + 1).fill(0))
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        lengths[i][j] = midA[i] === midB[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
      }
    }
    let i = 0
    let j = 0
    let removed = ''
    let added = ''
    const flush = () => { push(parts, 'removed', removed); push(parts, 'added', added); removed = ''; added = '' }
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) { flush(); push(parts, 'same', midA[i]); i++; j++ }
      else if (j >= midB.length || (i < midA.length && lengths[i + 1][j] >= lengths[i][j + 1])) removed += midA[i++]
      else added += midB[j++]
    }
    flush()
  }
  push(parts, 'same', a.slice(endA).join(''))
  return parts
}
