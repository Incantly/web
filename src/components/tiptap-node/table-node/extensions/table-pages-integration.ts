import type { Node } from "@tiptap/pm/model"
import type { EditorState } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { columnResizingPluginKey, findTable, TableMap } from "@tiptap/pm/tables"

/**
 * Optional integration between the table node view and the Pages extension
 * (`@tiptap-pro/extension-pages`).
 *
 * Pages paginates by floating full-width page breakers into the document
 * flow. Its injected stylesheet renders `table`/`tbody` as
 * `display: contents` and every `tr` as a `display: grid` block, so rows
 * flow around the breakers and a table can split across pages row by row.
 * This module supplies everything that rendering model needs from the
 * table side; the node view calls it only when Pages is detected on the
 * editor, so nothing here runs — or is even instantiated — in a regular
 * editor. There is deliberately no import from any Pages package:
 * detection is duck-typed via editor storage.
 *
 * All dynamic styling is written to a per-table `<style>` element in
 * `document.head`, NEVER to elements inside the editor. ProseMirror
 * consults the nearest ViewDesc for DOM mutations, so a row or cell
 * answers `ignoreMutation` itself (the table node view is never asked);
 * default descs don't ignore attribute writes, which turns any inline
 * style written from an observer into an unbounded mutation → redraw →
 * re-apply loop that hangs the tab. A stylesheet in `head` touches
 * nothing ProseMirror watches, and rows or cells that ProseMirror redraws
 * later match the rules with no further bookkeeping.
 */

/**
 * Monotonic id source for per-table-view grid stylesheets. Each
 * integration instance claims one id for its lifetime; ids never repeat
 * within a session, so a destroyed view can't collide with a live one.
 */
let pagesGridStyleId = 0

/**
 * Editor views with a pending post-layout pagination sync.
 *
 * Pages recalculates its page count in a single rAF after each
 * document-changing transaction. A table can finish relayout after that
 * rAF has already measured (row wrapping at resized column widths, React
 * widgets portaling back into the node view), leaving a stale page count
 * that nothing corrects — Pages' mutation observer only watches
 * `view.dom` attributes. Dispatching one meta-only transaction two rAFs
 * after a table change makes the pagination plugin re-compare page
 * counts against settled layout; its `apply` runs on every transaction
 * and rebuilds only when the count differs, so the sync is a no-op when
 * pagination is already correct. The nudge changes no nodes, therefore
 * it triggers no node-view updates and cannot re-schedule itself. The
 * set dedupes the dispatch across table views and rapid edits.
 */
const pendingPagesLayoutSync = new WeakSet<EditorView>()

function schedulePagesLayoutSync(view: EditorView) {
  if (pendingPagesLayoutSync.has(view)) {
    return
  }
  pendingPagesLayoutSync.add(view)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      pendingPagesLayoutSync.delete(view)
      if (view.isDestroyed || view.composing) {
        return
      }
      view.dispatch(view.state.tr.setMeta("tableNodePagesLayoutSync", true))
    })
  })
}

/**
 * Whether the Pages extension is registered on this editor. Duck-typed on
 * the extension's storage key so table-node never imports from Pages.
 */
export function isPagesIntegrationActive(editor: { storage: object }): boolean {
  return (editor.storage as Record<string, unknown>).pages !== undefined
}

/**
 * Whether a column drag is in progress on `table`. prosemirror-tables keeps
 * one resize state for the whole editor, so a drag belongs only to the table
 * that holds its active handle.
 */
export function isColumnDragging(state: EditorState, table: Node): boolean {
  const resizeState = columnResizingPluginKey.getState(state)
  if (!resizeState?.dragging || resizeState.activeHandle < 0) {
    return false
  }
  return findTable(state.doc.resolve(resizeState.activeHandle))?.node === table
}

/**
 * A cell that starts in a given row, resolved against the TableMap:
 * `domIndex` is its position among the row's DOM children (1-based for
 * nth-child), `column` its 1-based grid track, plus its spans.
 */
interface PlacedCell {
  row: number
  domIndex: number
  column: number
  colspan: number
  rowspan: number
}

/**
 * Vertical gap between two consecutive rows that we treat as a page
 * break. Same-page rows touch (0–1px apart); Pages' footer + gap +
 * header band is far taller than this.
 */
const PAGE_BREAK_GAP_PX = 30

export interface TablePagesIntegrationInput {
  /** The editor view, for post-layout pagination syncs. */
  view: EditorView
  /** The node view's outer block container (`[data-content-type="table"]`). */
  blockContainer: HTMLElement
  /** The `<colgroup>` maintained by prosemirror-tables' TableView. */
  colgroup: HTMLElement
  /** The `<tbody>` content DOM holding the rows. */
  contentDOM: HTMLElement
}

/**
 * Per-table-view Pages integration. Owns a generated stylesheet with:
 *
 * 1. The row `grid-template-columns` rule mirrored from `<col>` widths
 *    (grid ignores `<colgroup>`, and the column-resize plugin writes its
 *    live drag feedback to `<col>` styles only).
 * 2. When the table contains merged cells, explicit `grid-column`
 *    placement only for cells whose auto-placement would be wrong
 *    (`colspan > 1`, or rows shifted by a rowspan above them). Plain cells
 *    still rely on CSS Grid's normal auto-placement.
 * 3. Rowspan continuation: rows covered by a rowspan get a `tr::before`
 *    pseudo grid item in the spanned tracks that paints the merged
 *    cell's side and bottom edges (pseudo-elements of a grid container
 *    are grid items, and one that only stretches adds no height, so
 *    this is layout-feedback-free); the spanning cell's own bottom
 *    border is suppressed as an interior edge.
 * 4. A measured `::before` extension on the spanning cell itself that
 *    stretches its background over the covered rows. It is absolutely
 *    positioned (zero layout contribution — a real `height` on a grid
 *    item would grow its row and feed back into the measurement), and
 *    it stops at a page break so it never paints across Pages' footer
 *    band; the continuation area keeps its pseudo-painted borders,
 *    which matches how Word renders a vertically merged cell that
 *    crosses a page.
 * 5. A measured oversized-cell guard for single cells taller than the
 *    page content area. Normal cells stay `overflow: visible`; only cells
 *    that would otherwise be unsplittable across a page are clamped.
 */
export class TablePagesIntegration {
  private readonly view: EditorView
  private readonly blockContainer: HTMLElement
  private readonly colgroup: HTMLElement
  private readonly contentDOM: HTMLElement

  private readonly gridId: string
  private readonly styleElement: HTMLStyleElement

  /** Structural CSS (template + placement), rebuilt from the node. */
  private structuralCSS = ""
  /** Measured CSS (rowspan stretches + oversized-cell guards), rebuilt post-layout. */
  private measuredCSS = ""

  /**
   * Pending rAF that runs a post-layout {@link syncMeasured}. Coalesced so a
   * burst of structural syncs (e.g. every mousemove of a column drag) schedules
   * at most one measure per frame, and cancelled on {@link destroy} so a
   * torn-down view never measures.
   */
  private pendingMeasureRaf: number | null = null

  private node: Node

  /**
   * The element whose box gates measured passes — the `.table-container`
   * wrapping the rows (resolved once; the node view's DOM shape is stable
   * for its lifetime).
   */
  private readonly measuredContainer: HTMLElement

  /**
   * Container box at the last completed measure pass (-1 = never measured).
   * Geometry-derived CSS (oversized clamps, rowspan stretches) can only
   * change when the table's box changes, so an unchanged box lets
   * {@link syncMeasured} skip its per-row/per-cell layout reads — the
   * difference between O(rows × cols) forced reads per keystroke and none.
   */
  private lastMeasuredWidth = -1
  private lastMeasuredHeight = -1

  /**
   * Committed structural CSS frozen at column-drag start, plus the viewport
   * row range the live drag feedback is scoped to. During a drag the shared
   * `tr { grid-template-columns }` rule is NOT rewritten — doing so
   * invalidates and relayouts every row of the table on each mousemove,
   * which is seconds per frame at thousands of rows. Instead a higher-
   * specificity `tr:nth-child(n+A):nth-child(-n+B)` override applies the
   * live widths to the visible rows only; offscreen rows keep the pre-drag
   * widths until the commit on mouseup rewrites the full rule once.
   * (Scrolling mid-drag can reveal pre-drag widths; they correct on
   * release.)
   */
  private dragBaseCSS: string | null = null
  private dragRowRange: { from: number; to: number } | null = null

  /**
   * Set when a drag just committed: the full structural rule must replace
   * the drag overlay, but writing it inside the commit transaction would
   * stack the full-table invalidation onto the same task as prosemirror-
   * tables' attr commit and Pages' recalc (one multi-second block at
   * thousands of rows). The write happens in the next measure rAF instead
   * — the overlay already shows the final widths on the visible rows, so
   * nothing flashes.
   */
  private pendingDragCommitWrite = false

  /**
   * Mirrors `<col>` width mutations into the stylesheet. Scoped to the
   * colgroup subtree so it never interacts with Pages' own `view.dom`
   * attribute observer.
   */
  private readonly colObserver: MutationObserver

  /**
   * Re-measures rowspan stretches when the table's box changes (typing,
   * column wrapping, pagination pushing rows). Writing the measured CSS
   * only moves paint-level pseudos, so the observer settles immediately.
   */
  private readonly sizeObserver: ResizeObserver

  constructor(input: TablePagesIntegrationInput, node: Node) {
    this.view = input.view
    this.blockContainer = input.blockContainer
    this.colgroup = input.colgroup
    this.contentDOM = input.contentDOM
    this.node = node

    this.gridId = `${(pagesGridStyleId += 1)}`
    // Marker consumed by table-node.scss to unlock pagination: the
    // `.tableWrapper` overflow rules would otherwise create a block
    // formatting context, which turns the whole table into one atomic
    // box that cannot flow around Pages' floated page breakers (the
    // page count then grows unboundedly trying to fit it). The scoped
    // styles also repaint borders per cell, since `border-collapse` is
    // inert under `display: contents`.
    this.blockContainer.setAttribute("data-pages-active", "")
    this.blockContainer.setAttribute("data-pages-grid", this.gridId)

    this.styleElement = document.createElement("style")
    this.styleElement.dataset.tableNodePagesGrid = this.gridId
    document.head.appendChild(this.styleElement)

    this.colObserver = new MutationObserver(() => {
      this.syncStructure()
    })
    this.colObserver.observe(this.colgroup, {
      attributes: true,
      attributeFilter: ["style"],
      childList: true,
      subtree: true,
    })

    this.measuredContainer =
      (this.contentDOM.closest(".table-container") as HTMLElement | null) ??
      this.contentDOM

    this.sizeObserver = new ResizeObserver(() => {
      this.syncMeasured()
    })
    this.sizeObserver.observe(this.measuredContainer)

    this.syncStructure()
    schedulePagesLayoutSync(this.view)
  }

  /**
   * Called from the node view's `update()` with the new table node.
   * Rebuilds structural CSS; measured CSS and the pagination re-check are
   * owned by the measure pass, which only runs when the table's box
   * actually changed (ResizeObserver / rAF), so an edit that leaves the
   * geometry alone — the overwhelmingly common keystroke — costs no
   * layout reads and no extra transaction. Pages' own post-transaction
   * rAF recheck covers everything a geometry-neutral edit could affect.
   */
  onNodeUpdated(node: Node): void {
    this.node = node
    this.syncStructure()
  }

  destroy(): void {
    if (this.pendingMeasureRaf !== null) {
      cancelAnimationFrame(this.pendingMeasureRaf)
      this.pendingMeasureRaf = null
    }
    this.colObserver.disconnect()
    this.sizeObserver.disconnect()
    this.styleElement.remove()
  }

  /** Selector prefix scoping every generated rule to this table only. */
  private scope(suffix: string): string {
    return `.tiptap [data-content-type="table"][data-pages-grid="${this.gridId}"] ${suffix}`
  }

  /**
   * Resolve every cell's placement from the TableMap. `map.map` holds,
   * for each (row, column) slot, the position of the cell covering it.
   * Iterating slots in row-major order, a cell's first occurrence is its
   * top-left slot — the row it is a DOM child of and the track it starts
   * in; every later occurrence of the same position is coverage by
   * colspan or rowspan.
   */
  private resolvePlacements(map: TableMap): PlacedCell[] {
    const placements: PlacedCell[] = []
    const seen = new Set<number>()

    for (let row = 0; row < map.height; row += 1) {
      let domIndex = 0
      for (let col = 0; col < map.width; col += 1) {
        const cellPos = map.map[row * map.width + col]
        if (cellPos === undefined || seen.has(cellPos)) {
          continue
        }
        seen.add(cellPos)

        const cell = this.node.nodeAt(cellPos)
        domIndex += 1
        placements.push({
          row: row + 1,
          domIndex,
          column: col + 1,
          colspan: Number(cell?.attrs.colspan) || 1,
          rowspan: Number(cell?.attrs.rowspan) || 1,
        })
      }
    }

    return placements
  }

  /**
   * Rebuild the structural stylesheet: row template from `<col>` widths,
   * and — when the table contains merged cells — explicit per-cell
   * placement plus rowspan edge painting.
   */
  private syncStructure(): void {
    const tracks: string[] = []
    for (const col of Array.from(this.colgroup.children)) {
      const width = (col as HTMLTableColElement).style.width
      tracks.push(width || "1fr")
    }

    if (isColumnDragging(this.view.state, this.node)) {
      // Live drag: overlay the live track widths on the visible rows only
      // (see dragBaseCSS docs). structuralCSS/measuredCSS stay frozen so
      // the post-drag rebuild diffs against the committed state.
      if (this.dragBaseCSS === null) {
        this.dragBaseCSS = this.structuralCSS
        this.dragRowRange = this.computeVisibleRowRange()
      }
      if (tracks.length > 0 && this.dragRowRange) {
        const { from, to } = this.dragRowRange
        const override = `${this.scope(
          `tr:nth-child(n+${from}):nth-child(-n+${to})`
        )} { grid-template-columns: ${tracks.join(" ")}; }`
        this.styleElement.textContent = `${this.dragBaseCSS}\n${override}\n${this.measuredCSS}`
      }
      return
    }

    const dragEnded = this.dragBaseCSS !== null
    if (dragEnded) {
      this.dragBaseCSS = null
      this.dragRowRange = null
    }

    const rules: string[] = []
    if (tracks.length > 0) {
      rules.push(
        `${this.scope("tr")} { grid-template-columns: ${tracks.join(" ")}; }`
      )
    }

    const map = TableMap.get(this.node)
    const hasMergedCells = new Set(map.map).size !== map.map.length

    if (hasMergedCells) {
      const placements = this.resolvePlacements(map)
      // Rows an earlier row's rowspan reaches into. Placements run row by
      // row, so the rowspan loop below records a row before its cells come.
      const coveredRows = new Set<number>()

      for (const cell of placements) {
        const cellSelector = this.scope(
          `tr:nth-child(${cell.row}) > *:nth-child(${cell.domIndex})`
        )
        // Every cell of a row that a rowspan covers is placed explicitly.
        // Mixing auto-placed cells with column-locked siblings is not safe:
        // the auto-placement cursor jumps to each locked item's column (the
        // rowspan `tr::before` pseudo is one), so an auto cell that follows
        // it in order lands after that column instead of in the first free
        // track — e.g. a middle-column rowspan pushed the covered row's
        // first cell into the wrong track.
        if (coveredRows.has(cell.row)) {
          rules.push(
            `${cellSelector} { grid-column: ${cell.column} / span ${cell.colspan}; }`
          )
        } else if (cell.colspan > 1) {
          rules.push(`${cellSelector} { grid-column: span ${cell.colspan}; }`)
        }

        if (cell.rowspan > 1) {
          // The spanning cell's bottom border becomes an interior edge of
          // the merged area; the true bottom edge is painted by the last
          // covered row's pseudo (or, at the very bottom of the table,
          // by the covered row's own pseudo bottom border). The cell also opts
          // out of any measured oversized-cell guard by default: `overflow:
          // auto` would make it a scroll container and clip the absolutely
          // positioned background extension. When the cell itself is taller
          // than a page, the measured CSS re-clamps it (it is appended after
          // this rule, so it wins the tie) and its stretch is skipped.
          rules.push(
            `${cellSelector} { border-bottom: 0; overflow: visible; max-height: none; }`
          )

          for (let offset = 1; offset < cell.rowspan; offset += 1) {
            const coveredRow = cell.row + offset
            coveredRows.add(coveredRow)
            const isLast = offset === cell.rowspan - 1
            const pseudo = this.scope(`tr:nth-child(${coveredRow})::before`)
            // A stretching, explicitly-placed pseudo grid item: paints
            // the merged area's right (and left, at the table edge)
            // border through the covered rows, and the bottom edge on
            // the last one. It has no height of its own, so it cannot
            // feed back into row sizing.
            rules.push(
              `${pseudo} { content: ""; grid-column: ${cell.column} / span ${cell.colspan}; ` +
                `border-right: 1px solid var(--tt-table-border-color); ` +
                (cell.column === 1
                  ? `border-left: 1px solid var(--tt-table-border-color); `
                  : "") +
                (isLast
                  ? `border-bottom: 1px solid var(--tt-table-border-color); `
                  : "") +
                `}`
            )
          }
        }
      }
    }

    const structuralCSS = rules.join("\n")
    if (dragEnded) {
      // The write must happen even when the committed CSS is byte-identical
      // (drag returned to the original widths): the style element currently
      // holds the drag overlay text. It is deferred to the measure rAF so
      // the full-table invalidation stays out of the commit transaction.
      this.structuralCSS = structuralCSS
      this.pendingDragCommitWrite = true
    } else if (structuralCSS !== this.structuralCSS) {
      this.structuralCSS = structuralCSS
      this.writeStylesheet()
    }
    // Whether structure changed or not, measuring is deferred to the next
    // frame: {@link syncMeasured} skips itself when the table's box is
    // unchanged, so the common no-geometry-change transaction never pays
    // for layout reads. A real change (row heights, wrapping) also fires
    // the ResizeObserver, which measures directly.
    this.scheduleMeasure()
  }

  /**
   * Rows currently intersecting the viewport, as 1-based nth-child bounds
   * with a small margin. Rows are vertically ordered, so two binary
   * searches bound the range in ~2·log₂(N) rect reads — done once per
   * drag, not per mousemove.
   */
  private computeVisibleRowRange(): { from: number; to: number } {
    const rows = this.contentDOM.children
    const total = rows.length
    if (total === 0) {
      return { from: 1, to: 1 }
    }
    const viewHeight = window.innerHeight

    let lo = 0
    let hi = total - 1
    let first = total - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const row = rows[mid]
      if (!row) {
        break
      }
      if (row.getBoundingClientRect().bottom >= 0) {
        first = mid
        hi = mid - 1
      } else {
        lo = mid + 1
      }
    }

    lo = first
    hi = total - 1
    let last = first
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const row = rows[mid]
      if (!row) {
        break
      }
      if (row.getBoundingClientRect().top <= viewHeight) {
        last = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    const margin = 10
    return {
      from: Math.max(1, first + 1 - margin),
      to: Math.min(total, last + 1 + margin),
    }
  }

  /**
   * Run {@link syncMeasured} on the next frame, coalescing repeated calls so a
   * rapid burst of structural syncs measures at most once per frame instead of
   * forcing a layout read on every one.
   */
  private scheduleMeasure(): void {
    if (this.pendingMeasureRaf !== null) {
      return
    }
    this.pendingMeasureRaf = requestAnimationFrame(() => {
      this.pendingMeasureRaf = null
      if (this.pendingDragCommitWrite) {
        this.pendingDragCommitWrite = false
        this.writeStylesheet()
      }
      this.syncMeasured()
    })
  }

  /**
   * Rebuild the measured stylesheet: for every rowspan cell, stretch its
   * background over the rows it covers via an absolutely positioned
   * `::before` — clipped to the current page, so the stretch never
   * paints across a page-break band.
   */
  private syncMeasured(): void {
    // Live column drag: <col> widths change on every mousemove, so a full
    // measured pass — O(rows) reads against a layout the drag just dirtied
    // — would run per frame and multiply into seconds of jank on large
    // tables, only to be obsolete one mousemove later. Stay quiescent for
    // the whole drag: the drag's final transaction (`colwidth` attrs on
    // mouseup) arrives as a normal node update whose structural sync
    // schedules a measure, and by then `dragging` is null again, so one
    // full pass runs against settled geometry.
    if (isColumnDragging(this.view.state, this.node)) {
      return
    }

    const map = TableMap.get(this.node)
    const hasRowspans = map.map.some(
      (pos, index) => index >= map.width && map.map[index - map.width] === pos
    )

    // Box gate: measured CSS derives entirely from row/cell geometry, and
    // for a rowspan-free table that geometry cannot produce different rules
    // while the container box is unchanged. Rowspan stretches additionally
    // depend on where Pages' break bands sit BETWEEN rows — which can move
    // without changing the total box — so tables with rowspans always run
    // the full pass. The box read is this pass's only forced layout.
    const boxWidth = this.measuredContainer.offsetWidth
    const boxHeight = this.measuredContainer.offsetHeight
    const boxChanged =
      boxWidth !== this.lastMeasuredWidth ||
      boxHeight !== this.lastMeasuredHeight
    if (!hasRowspans && !boxChanged) {
      return
    }
    this.lastMeasuredWidth = boxWidth
    this.lastMeasuredHeight = boxHeight

    const placements = this.resolvePlacements(map)
    const rows = Array.from(this.contentDOM.children).filter(
      (child): child is HTMLTableRowElement =>
        child instanceof HTMLTableRowElement
    )
    if (rows.length === 0) {
      return
    }

    const { rules, oversizedCells } = this.createOversizedCellRules(
      placements,
      rows
    )

    if (!hasRowspans) {
      this.updateMeasuredCSS(rules)
      // The box changed even if the resulting CSS did not (e.g. rows grew
      // without any cell crossing the page-height threshold). Pages may
      // have measured before this layout settled; nudge it to re-compare.
      if (boxChanged) {
        schedulePagesLayoutSync(this.view)
      }
      return
    }

    // Row geometry relative to the offset parent — stable regardless of
    // scroll position, cheap to read.
    const rowTops = rows.map((row) => row.offsetTop)
    const rowBottoms = rows.map((row) => row.offsetTop + row.offsetHeight)

    for (const cell of placements) {
      if (cell.rowspan <= 1) {
        continue
      }
      // A clamped oversized spanning cell is a scroll container again, which
      // would clip the stretch pseudo — and a page-tall merged cell has no
      // meaningful area to stretch over anyway.
      if (oversizedCells.has(`${cell.row}:${cell.domIndex}`)) {
        continue
      }
      const startIndex = cell.row - 1
      if (startIndex >= rows.length) {
        continue
      }

      const startBottom = rowBottoms[startIndex]
      if (startBottom === undefined) {
        continue
      }

      // Walk the covered rows on the same page as the spanning cell; a
      // jump between consecutive rows larger than a normal border means
      // a page-break band sits between them.
      let segmentEnd = startIndex
      for (
        let next = startIndex + 1;
        next < Math.min(startIndex + cell.rowspan, rows.length);
        next += 1
      ) {
        const nextTop = rowTops[next] ?? 0
        const prevBottom = rowBottoms[next - 1] ?? nextTop
        if (nextTop - prevBottom > PAGE_BREAK_GAP_PX) {
          break
        }
        segmentEnd = next
      }

      const extra = (rowBottoms[segmentEnd] ?? startBottom) - startBottom
      if (extra <= 0) {
        continue
      }

      const pseudo = this.scope(
        `tr:nth-child(${cell.row}) > *:nth-child(${cell.domIndex})::before`
      )
      rules.push(
        `${pseudo} { content: ""; position: absolute; z-index: 1; ` +
          `left: 0; right: -1px; top: 100%; height: ${extra}px; ` +
          `background: inherit; ` +
          `border-right: 1px solid var(--tt-table-border-color); ` +
          (cell.column === 1
            ? `border-left: 1px solid var(--tt-table-border-color); left: -1px; `
            : "") +
          `border-bottom: 1px solid var(--tt-table-border-color); }`
      )
    }

    this.updateMeasuredCSS(rules)
    if (boxChanged) {
      schedulePagesLayoutSync(this.view)
    }
  }

  /**
   * A single table row cannot be split by Pages. Most cells should keep normal
   * visible overflow so they do not capture wheel/touch scrolling. Only cells
   * whose own content is taller than the page content area get an explicit
   * scroll guard, preventing one unsplittable row from forcing runaway
   * pagination.
   *
   * Spanning (rowspan) cells are included: an unguarded page-tall merged
   * cell reintroduces exactly the unbounded page growth this exists to
   * stop. Their clamp rule lands in the measured CSS, which is written
   * after the structural `overflow: visible` rule with the same
   * specificity, so the clamp wins; the caller skips the background
   * stretch for these cells.
   */
  private createOversizedCellRules(
    placements: PlacedCell[],
    rows: HTMLTableRowElement[]
  ): { rules: string[]; oversizedCells: Set<string> } {
    const oversizedCells = new Set<string>()
    const pageMaxHeight = parseFloat(
      getComputedStyle(this.blockContainer).getPropertyValue(
        "--page-max-height"
      )
    )
    if (!Number.isFinite(pageMaxHeight) || pageMaxHeight <= 0) {
      return { rules: [], oversizedCells }
    }

    // A cell's content can only exceed the page height if its row is about
    // that tall: an unclamped cell grows its row to its own height, and an
    // already-clamped cell holds its row at exactly the page max. Rows
    // shorter than that (with a small slack for borders/rounding) cannot
    // contain an oversized cell, so their cells are never read — turning
    // the per-cell `scrollHeight` sweep from O(rows × cols) into a no-op
    // for ordinary tables.
    const rowCanContainOversized = rows.map(
      (row) => row.offsetHeight > pageMaxHeight - 8
    )

    const rules: string[] = []
    for (const cell of placements) {
      if (!rowCanContainOversized[cell.row - 1]) {
        continue
      }
      const row = rows[cell.row - 1]
      const cellElement = row?.children[cell.domIndex - 1]
      if (!(cellElement instanceof HTMLElement)) {
        continue
      }

      if (cellElement.scrollHeight <= pageMaxHeight + 1) {
        continue
      }

      oversizedCells.add(`${cell.row}:${cell.domIndex}`)
      const cellSelector = this.scope(
        `tr:nth-child(${cell.row}) > *:nth-child(${cell.domIndex})`
      )
      rules.push(
        `${cellSelector} { max-height: var(--page-max-height); overflow: auto; }`
      )
    }

    return { rules, oversizedCells }
  }

  private updateMeasuredCSS(rules: string[]): void {
    const measuredCSS = rules.join("\n")
    if (measuredCSS !== this.measuredCSS) {
      this.measuredCSS = measuredCSS
      this.writeStylesheet()
      schedulePagesLayoutSync(this.view)
    }
  }

  private writeStylesheet(): void {
    this.styleElement.textContent = `${this.structuralCSS}\n${this.measuredCSS}`
  }
}
