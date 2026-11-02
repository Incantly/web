import type { DocumentNode } from '@incantly/canvas-core/document'
import { DOMSerializer, type Schema } from '@tiptap/pm/model'
import type { JSONContent } from '@tiptap/core'
import katex from 'katex'
import { incantlyBlocksToProseMirror } from './conversion'

/**
 * A read-only preview of canonical blocks a suggestion would add (docs/agent-note-edits.md): drawn
 * with the note's own schema and HTML, so a suggested table, list or quote looks like the real
 * thing, but never inserted into the document. Math is typeset with KaTeX, images load through
 * the note's asset host, and links stay inert until the change is accepted. A block that can't be
 * drawn shows its plain-text fallback instead.
 */

export type PreviewOptions = {
  /** Short-lived URL for an image asset (the note's asset host). */
  resolveImage?: (assetId: string) => Promise<string>
}

function typeset(element: HTMLElement, latex: string, displayMode: boolean) {
  element.textContent = ''
  // KaTeX escapes its input and `trust` stays off; bad TeX shows as red source, never throws.
  katex.render(latex, element, { throwOnError: false, displayMode, output: 'htmlAndMathml' })
}

function imageAssets(json: JSONContent, found: { assetId: string; alt: string }[] = []) {
  if (json.type === 'image') found.push({ assetId: String(json.attrs?.assetId ?? ''), alt: String(json.attrs?.alt ?? '') })
  for (const child of json.content ?? []) imageAssets(child, found)
  return found
}

/** Makes serialized HTML safe and inert to show inside the editor. */
function finish(root: HTMLElement, json: JSONContent, options: PreviewOptions) {
  for (const element of root.querySelectorAll<HTMLElement>('[data-node-id]')) element.removeAttribute('data-node-id')
  for (const element of root.querySelectorAll<HTMLElement>('[contenteditable]')) element.removeAttribute('contenteditable')
  // Not clickable until accepted: keep the text and the address (as a tooltip), drop the href.
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = link.getAttribute('href') ?? ''
    link.removeAttribute('href')
    link.removeAttribute('target')
    link.title = `${href} (opens once accepted)`
    link.classList.add('incantly-suggestion-link')
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-type="block-math"]')) typeset(element, element.dataset.latex ?? '', true)
  for (const element of root.querySelectorAll<HTMLElement>('[data-type="inline-math"]')) typeset(element, element.dataset.latex ?? '', false)
  for (const element of root.querySelectorAll<HTMLElement>('span[data-inline-math]')) typeset(element, element.dataset.inlineMath ?? '', false)
  const images = imageAssets(json)
  root.querySelectorAll<HTMLElement>('figure[data-incantly-node="image"]').forEach((figure, index) => {
    const asset = images[index]
    if (!asset) return
    const image = document.createElement('img')
    image.alt = asset.alt
    image.className = 'incantly-suggestion-image'
    figure.append(image)
    if (!asset.assetId || !options.resolveImage) { figure.textContent = asset.alt || 'Image'; return }
    options.resolveImage(asset.assetId)
      .then((url) => { image.src = url })
      .catch(() => { figure.textContent = asset.alt || 'Image unavailable' })
  })
}

/** Renders `blocks` as note HTML, block by block; `texts[i]` stands in for any block that fails. */
export function renderBlocksPreview(schema: Schema, blocks: readonly DocumentNode[], texts: readonly string[], options: PreviewOptions = {}): HTMLElement {
  const root = document.createElement('div')
  root.className = 'incantly-suggestion-preview'
  const serializer = DOMSerializer.fromSchema(schema)
  const fallback = (index: number) => {
    const text = texts[index]
    if (text) root.append(Object.assign(document.createElement('p'), { textContent: text }))
  }
  blocks.forEach((block, index) => {
    try {
      const [json] = incantlyBlocksToProseMirror([block])
      if (!json) return fallback(index)
      const wrapper = document.createElement('div')
      const node = schema.nodeFromJSON(json)
      node.check()
      wrapper.append(serializer.serializeNode(node))
      finish(wrapper, json, options)
      root.append(...wrapper.childNodes)
    } catch {
      fallback(index)
    }
  })
  if (!blocks.length) texts.forEach((_, index) => fallback(index))
  return root
}
