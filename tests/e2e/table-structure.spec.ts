import { expect, test, type Page } from '@playwright/test'
import { captureProblems, check, pressToolbarButton, shot } from './artifacts'

async function openNote(page: Page) {
  await page.goto('/dashboard', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Why cities stay warm/i }).first().click()
  await page.waitForTimeout(2500)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('z')
  await page.waitForTimeout(400)
  expect(await editor.innerText()).toContain('z')
  await page.keyboard.press('Backspace')
  return editor
}

const rows = (page: Page) => page.locator('.ProseMirror table tr').count()
const cols = (page: Page) => page.locator('.ProseMirror table tr').first().locator('th, td').count()

async function selectCellText(page: Page, row: number, cell: number, text: string) {
  await page.locator('.ProseMirror table tr').nth(row).locator('th, td').nth(cell).locator('p').click()
  await page.waitForTimeout(300)
  await page.keyboard.type(text, { delay: 15 })
  await page.keyboard.press('Shift+Home')
  await page.waitForTimeout(500)
}

async function typeCellText(page: Page, row: number, cell: number, text: string) {
  await page.locator('.ProseMirror table tr').nth(row).locator('th, td').nth(cell).locator('p').click()
  await page.waitForTimeout(300)
  await page.keyboard.type(text, { delay: 15 })
  await page.waitForTimeout(400)
}

test.describe('table structure', () => {
  test('insert, grow, shrink, tab-extend, and persist tables', async ({ page }: { page: Page }) => {
    const problems = await captureProblems(page, async () => {
      await openNote(page)

      // Insert a 3x3 table via slash.
      await page.keyboard.press('Enter')
      for (const ch of '/table') await page.keyboard.type(ch, { delay: 25 })
      await page.waitForTimeout(800)
      await expect(page.locator('.incantly-document-slash-menu [role="menuitem"] strong').first()).toHaveText('Table')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      expect(await rows(page)).toBe(3)
      expect(await cols(page)).toBe(3)
      check('table-structure', 'table inserts 3x3', true, '3 rows, 3 cols')

      // Mobile variation first: 375px viewport, no horizontal page scroll.
      await page.setViewportSize({ width: 375, height: 667 })
      await page.waitForTimeout(500)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check('table-structure', 'no horizontal scroll at 375px', overflow <= 1, `overflow=${overflow}px`)
      expect(overflow).toBeLessThanOrEqual(1)
      await shot(page, 'table-mobile')
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.waitForTimeout(400)
      await shot(page, 'table-inserted')

      // Bubble controls appear inside a cell with a selection.
      await selectCellText(page, 0, 0, 'Name')
      for (const name of ['Add row below', 'Add column to the right', 'Delete current row', 'Delete current column']) {
        await expect(page.getByRole('button', { name }).first()).toBeVisible()
      }
      check('table-structure', 'bubble table controls appear', true, '+Row +Col −Row −Col visible')
      await shot(page, 'table-controls')

      // Add a row below.
      await pressToolbarButton(page, 'Add row below')
      await page.waitForTimeout(500)
      expect(await rows(page)).toBe(4)
      check('table-structure', 'row added', true, 'rows=4')
      await shot(page, 'table-row-added')

      // Add a column to the right.
      await selectCellText(page, 0, 1, 'Age')
      await pressToolbarButton(page, 'Add column to the right')
      await page.waitForTimeout(500)
      expect(await cols(page)).toBe(4)
      check('table-structure', 'column added', true, 'cols=4')
      await shot(page, 'table-col-added')

      // Tab in the last cell appends a row and lands in it.
      await page.locator('.ProseMirror table tr').last().locator('th, td').last().locator('p').click()
      await page.waitForTimeout(300)
      await page.keyboard.press('Tab')
      await page.waitForTimeout(600)
      expect(await rows(page)).toBe(5)
      const caretInNewRow = await page.evaluate(() => {
        const node = window.getSelection()?.anchorNode
        const el = node instanceof Element ? node : node?.parentElement
        const row = el?.closest('tr')
        const table = el?.closest('table')
        if (!row || !table) return false
        const all = Array.from(table.querySelectorAll('tr'))
        return all.indexOf(row) === all.length - 1
      })
      check('table-structure', 'tab extends table with caret in new row', caretInNewRow, `caretInNewRow=${caretInNewRow}`)
      expect(caretInNewRow).toBe(true)
      await shot(page, 'table-tab-extended')

      // Keep text in the last row, then delete the first row and last column.
      await typeCellText(page, 4, 0, 'Keepme')
      await typeCellText(page, 1, 3, 'Temp')
      await selectCellText(page, 0, 0, '')
      await pressToolbarButton(page, 'Delete current row')
      await page.waitForTimeout(500)
      expect(await rows(page)).toBe(4)
      await selectCellText(page, 0, 3, '')
      await pressToolbarButton(page, 'Delete current column')
      await page.waitForTimeout(500)
      expect(await cols(page)).toBe(3)
      check('table-structure', 'row and column delete', true, 'back to 4x3')
      expect(await page.locator('.ProseMirror').innerText()).toContain('Keepme')
      await shot(page, 'table-shrunk')

      // Reload: structure and surviving text persist through the round trip.
      await page.waitForTimeout(1200)
      await page.reload({ waitUntil: 'networkidle' })
      await openNote(page)
      expect(await rows(page)).toBe(4)
      expect(await cols(page)).toBe(3)
      check('table-structure', 'table persists after reload', true, '4 rows, 3 cols')
      expect(await page.locator('.ProseMirror').innerText()).toContain('Keepme')
      await shot(page, 'table-persisted')
    })

    check('table-structure', 'zero console/page/http errors', problems.length === 0, problems.slice(0, 3).join(' | '))
    expect(problems, `page problems: ${problems.join(' | ')}`).toEqual([])
  })
})
