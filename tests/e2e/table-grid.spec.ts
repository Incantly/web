import { expect, test, type Page } from '@playwright/test'
import { captureProblems, check, shot } from './artifacts'

async function openNote(page: Page) {
  await page.goto('/dashboard', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Why cities stay warm/i }).first().click()
  await page.waitForTimeout(2500)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('z')
  await expect(editor).toContainText('z')
  await page.keyboard.press('Backspace')
  return editor
}

async function openTableMenu(page: Page) {
  await page.keyboard.type('/table', { delay: 25 })
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toBeVisible()
}

const gridCells = (page: Page) => page.locator('.tiptap-table-grid-cell')
const selectedCells = (page: Page) => page.locator('.tiptap-table-grid-cell.selected')
const sizeIndicator = (page: Page) => page.locator('.tiptap-table-size-indicator')

test.describe('slash grid picker', () => {
  test('Table opens a 6x6 picker and inserts the selected canonical table', async ({ page }: { page: Page }) => {
    const problems = await captureProblems(page, async () => {
      await openNote(page)
      await page.keyboard.press('Enter')

      // A pointer selection opens the picker without inserting a one-cell table.
      await openTableMenu(page)
      await page.getByRole('button', { name: 'Table', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'Table size' })).toBeVisible()
      await expect(gridCells(page)).toHaveCount(36)
      await page.getByRole('button', { name: 'Select 3x3 table' }).hover()
      await expect(selectedCells(page)).toHaveCount(9)
      await expect(sizeIndicator(page)).toContainText('3x3')
      await expect(page.locator('.ProseMirror table')).toHaveCount(0)
      check('table-grid', 'clicking Table opens the picker', true, '6x6 grid at the 3x3 default; no table inserted')
      await shot(page, 'table-grid/open')

      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowDown')
      await expect(sizeIndicator(page)).toContainText('5x4')
      const cellBox = await gridCells(page).first().boundingBox()
      expect(cellBox?.width).toBeGreaterThanOrEqual(44)
      expect(cellBox?.height).toBeGreaterThanOrEqual(44)
      await page.keyboard.press('Enter')
      const firstTable = page.locator('.ProseMirror table').first()
      await expect(firstTable.locator('tr')).toHaveCount(4)
      await expect(firstTable.locator('tr').first().locator('th, td')).toHaveCount(5)
      check('table-grid', 'keyboard selection inserts a sized table', true, '4 rows, 5 columns')
      await shot(page, 'table-grid/inserted')

      check('table-grid', 'grid cells meet the touch target', true, 'at least 44px by 44px')
    })

    check('table-grid', 'zero console/page/http errors', problems.length === 0, problems.slice(0, 3).join(' | '))
    expect(problems, `page problems: ${problems.join(' | ')}`).toEqual([])
  })

  test('picker stays usable across the required responsive widths', async ({ page }: { page: Page }) => {
    await openNote(page)

    for (const viewport of [
      { width: 320, height: 568, name: 'mobile-320' },
      { width: 375, height: 812, name: 'mobile-375' },
      { width: 768, height: 1024, name: 'tablet-768' },
      { width: 1024, height: 768, name: 'desktop-1024' },
      { width: 1440, height: 900, name: 'desktop-1440' },
    ]) {
      await page.setViewportSize(viewport)
      await page.locator('.ProseMirror').click()
      await page.keyboard.press('Enter')
      await openTableMenu(page)
      await page.getByRole('button', { name: 'Table', exact: true }).click()

      const dialog = page.getByRole('dialog', { name: 'Table size' })
      await expect(dialog).toBeVisible()
      const box = await dialog.boundingBox()
      const lastCellBox = await gridCells(page).last().boundingBox()
      expect(box).not.toBeNull()
      expect(lastCellBox).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
      expect(lastCellBox!.x + lastCellBox!.width).toBeLessThanOrEqual(box!.x + box!.width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
      await shot(page, `table-grid/${viewport.name}`)
      check('table-grid', `picker fits ${viewport.width}px viewport`, true, `${Math.round(box!.width)}px wide without page overflow`)
      await page.keyboard.press('Escape')
    }
  })

  test('Table remains available across repeated slash queries', async ({ page }: { page: Page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    const editor = await openNote(page)

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await page.keyboard.press('Enter')
      await page.keyboard.type('/table', { delay: 20 })
      await expect(page.getByRole('button', { name: 'Table', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      for (let i = 0; i < 6; i += 1) await editor.press('Backspace')
    }
  })
})
