import { expect, test, type Page } from '@playwright/test'
import { captureProblems, check, shot } from './artifacts'

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

const gridCells = (page: Page) => page.locator('.incantly-slash-grid-cell')

async function freshParagraph(page: Page) {
  await page.locator('.ProseMirror > p').first().click()
  await page.waitForTimeout(200)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
}

test.describe('slash grid picker', () => {
  test('table sizes, escape, hover, and scroll-follow', async ({ page }: { page: Page }) => {
    const problems = await captureProblems(page, async () => {
      await openNote(page)

      // ArrowRight opens the grid at the 3x3 default.
      await page.keyboard.press('Enter')
      for (const ch of '/table') await page.keyboard.type(ch, { delay: 25 })
      await page.waitForTimeout(800)
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(400)
      expect(await gridCells(page).count()).toBe(36)
      await expect(page.locator('.incantly-slash-grid-size')).toHaveText('3 × 3')
      await shot(page, 'table-grid-open')

      // Size to 4 rows by 5 columns with arrows, confirm with Enter.
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(300)
      await expect(page.locator('.incantly-slash-grid-size')).toHaveText('4 × 5')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(600)
      expect(await page.locator('.ProseMirror table tr').count()).toBe(4)
      expect(await page.locator('.ProseMirror table tr').first().locator('th, td').count()).toBe(5)
      check('table-grid', 'grid inserts sized table', true, '4 rows, 5 cols')
      await shot(page, 'table-grid-inserted')

      // Escape returns to the list; Enter then inserts the 3x3 default.
      await freshParagraph(page)
      for (const ch of '/table') await page.keyboard.type(ch, { delay: 25 })
      await page.waitForTimeout(800)
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(300)
      expect(await gridCells(page).count()).toBe(36)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      expect(await gridCells(page).count()).toBe(0)
      await expect(page.locator('.incantly-document-slash-menu [role="menuitem"] strong').first()).toHaveText('Table')
      check('table-grid', 'escape returns to list', true, 'grid closed, menu open')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(600)
      const tables = page.locator('.ProseMirror table')
      expect(await tables.count()).toBe(2)
      // The fresh paragraph sits before the first table, so the default
      // 3x3 lands at index 0 and the earlier 4x5 grid table at index 1.
      expect(await tables.nth(0).locator('tr').count()).toBe(3)
      expect(await tables.nth(0).locator('tr').first().locator('th, td').count()).toBe(3)
      check('table-grid', 'enter keeps 3x3 default', true, 'new table 3x3 at index 0')

      // Hovering the row opens the grid for mouse users.
      await freshParagraph(page)
      for (const ch of '/table') await page.keyboard.type(ch, { delay: 25 })
      await page.waitForTimeout(800)
      await page.locator('.incantly-document-slash-menu [role="menuitem"]').first().hover()
      await page.waitForTimeout(400)
      expect(await gridCells(page).count()).toBe(36)
      check('table-grid', 'hover opens grid', true, '36 cells')
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)

      // Scroll-follow: arrowing to the last of all items keeps it visible.
      await freshParagraph(page)
      await page.keyboard.type('/', { delay: 25 })
      await page.waitForTimeout(800)
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('ArrowDown')
        await page.waitForTimeout(120)
      }
      const active = page.locator('.incantly-document-slash-menu [role="menuitem"][aria-current="true"] strong')
      await expect(active).toHaveText('Divider')
      const follows = await page.evaluate(() => {
        const menu = document.querySelector('.incantly-document-slash-menu')
        const item = document.querySelector('.incantly-document-slash-menu [aria-current="true"]')
        if (!menu || !item) return { scrolled: false, inside: false }
        const menuBox = menu.getBoundingClientRect()
        const itemBox = item.getBoundingClientRect()
        return {
          scrolled: (menu as HTMLElement).scrollTop > 0,
          inside: itemBox.top >= menuBox.top - 1 && itemBox.bottom <= menuBox.bottom + 1,
        }
      })
      check('table-grid', 'arrow navigation scrolls the list', follows.scrolled && follows.inside, JSON.stringify(follows))
      expect(follows.scrolled).toBe(true)
      expect(follows.inside).toBe(true)
      await shot(page, 'table-scroll-follow')
    })

    check('table-grid', 'zero console/page/http errors', problems.length === 0, problems.slice(0, 3).join(' | '))
    expect(problems, `page problems: ${problems.join(' | ')}`).toEqual([])
  })
})
