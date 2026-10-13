import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface WebPaginationSnapshot { blockCount: number; contentHeight: number; breakPositions: number[] }
export interface WebPaginationOptions { pageHeight?: number; pageGap?: number; onLayout?: (snapshot: WebPaginationSnapshot) => void }

export const WebPagination = Extension.create<WebPaginationOptions>({
  name: 'incantlyWebPagination',
  addOptions: () => ({ pageHeight: 1056, pageGap: 24 }),
  addProseMirrorPlugins() {
    const options = this.options
    const key = new PluginKey<DecorationSet>('incantlyWebPagination')
    return [new Plugin<DecorationSet>({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply(transaction, decorations) {
          const replacement = transaction.getMeta(key) as DecorationSet | undefined
          return replacement ?? decorations.map(transaction.mapping, transaction.doc)
        },
      },
      props: { decorations: (state) => key.getState(state) },
      view(view) {
        let frame = 0
        let lastKey = ''
        const measure = () => {
          frame = 0
          const root = view.dom as HTMLElement
          const blocks = Array.from(root.children) as HTMLElement[]
          const rootTop = root.getBoundingClientRect().top
          const breaks: number[] = []
          const decorations: Decoration[] = []
          let nextBoundary = options.pageHeight ?? 1056
          blocks.forEach((block) => {
            const bottom = block.getBoundingClientRect().bottom - rootTop
            if (bottom > nextBoundary) {
              const position = view.posAtDOM(block, 0)
              breaks.push(position)
              decorations.push(Decoration.widget(position, () => {
                const marker = document.createElement('div')
                marker.className = 'incantly-calculated-page-break'
                marker.setAttribute('aria-hidden', 'true')
                return marker
              }, { side: -1 }))
              while (bottom > nextBoundary) nextBoundary += options.pageHeight ?? 1056
            }
          })
          const contentHeight = root.scrollHeight
          options.onLayout?.({ blockCount: blocks.length, contentHeight, breakPositions: breaks })
          const nextKey = `${contentHeight}:${breaks.join(',')}`
          if (nextKey === lastKey) return
          lastKey = nextKey
          view.dispatch(view.state.tr.setMeta(key, DecorationSet.create(view.state.doc, decorations)))
        }
        const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
        schedule()
        document.fonts?.ready.then(schedule)
        const observer = new ResizeObserver(schedule)
        observer.observe(view.dom)
        return { update: schedule, destroy() { if (frame) cancelAnimationFrame(frame); observer.disconnect() } }
      },
    })]
  },
})
