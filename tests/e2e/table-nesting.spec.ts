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

const tables = (page: Page) => page.locator('.ProseMirror table').count()

test.describe('table nesting guard', () => {
  test('no nested tables and wide tables stay contained', async ({ page }: { page: Page }) => {
    const problems = await captureProblems(page, async () => {
      await openNote(page)

      // Top-level insert still works.
      await page.keyboard.press('Enter')
      for (const ch of '/table') await page.keyboard.type(ch, { delay: 25 })
      await page.waitForTimeout(800)
      await expect(page.locator('.incantly-document-slash-menu [role="menuitem"] strong').first()).toHaveText('Table')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(400)
      expect(await page.locator('.incantly-slash-grid-cell').count()).toBe(36)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      expect(await tables(page)).toBe(1)

      // Inside a cell, /table offers nothing and inserts nothing.
      await page.locator('.ProseMirror table tr').nth(1).locator('th, td').nth(1).locator('p').click()
      await page.waitForTimeout(300)
      for (const ch of '/table') await page.keyboard.type(ch, { delay: 25 })
      await page.waitForTimeout(800)
      const menuLabels = await page.locator('.incantly-document-slash-menu [role="menuitem"] strong').allInnerTexts()
      check('table-nesting', 'no table offer inside a cell', !menuLabels.includes('Table'), JSON.stringify(menuLabels))
      expect(menuLabels).not.toContain('Table')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      expect(await tables(page)).toBe(1)
      check('table-nesting', 'no nested table created', true, 'still 1 table')
      await shot(page, 'table-no-nest')

      // Grow to 6 columns: the table must scroll inside, not break the page.
      await page.locator('.ProseMirror table tr').first().locator('th, td').first().locator('p').click()
      await page.waitForTimeout(300)
      await page.keyboard.type('H', { delay: 10 })
      await page.keyboard.press('Shift+Home')
      await page.waitForTimeout(500)
      for (let i = 0; i < 3; i++) {
        // Each command collapses the selection and closes the bubble, so
        // re-select like a user would before pressing again.
        await page.locator('.ProseMirror table tr').first().locator('th, td').first().locator('p').click()
        await page.waitForTimeout(300)
        await page.keyboard.press('Shift+Home')
        await page.waitForTimeout(400)
        await pressToolbarButton(page, 'Add column to the right')
        await page.waitForTimeout(400)
      }
      expect(await page.locator('.ProseMirror table tr').first().locator('th, td').count()).toBe(6)
      const overflowDesktop = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check('table-nesting', 'wide table contained on desktop', overflowDesktop <= 1, `overflow=${overflowDesktop}px`)
      expect(overflowDesktop).toBeLessThanOrEqual(1)
      await shot(page, 'table-wide-contained')

      await page.setViewportSize({ width: 375, height: 667 })
      await page.waitForTimeout(500)
      const overflowMobile = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check('table-nesting', 'wide table contained at 375px', overflowMobile <= 1, `overflow=${overflowMobile}px`)
      expect(overflowMobile).toBeLessThanOrEqual(1)
      const innerScroll = await page.locator('.ProseMirror table').first().evaluate((el) => el.scrollWidth - el.clientWidth)
      check('table-nesting', 'wide table fits without inner scroll', innerScroll <= 1, `inner=${innerScroll}px`)
      expect(innerScroll).toBeLessThanOrEqual(1)
      await shot(page, 'table-wide-mobile')
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.waitForTimeout(400)

      await page.waitForTimeout(1200)
      await page.reload({ waitUntil: 'networkidle' })
      await openNote(page)
      expect(await tables(page)).toBe(1)
      expect(await page.locator('.ProseMirror table tr').first().locator('th, td').count()).toBe(6)
      check('table-nesting', 'wide table persists after reload', true, '1 table, 6 cols')
      await shot(page, 'table-wide-persisted')
    })

    check('table-nesting', 'zero console/page/http errors', problems.length === 0, problems.slice(0, 3).join(' | '))
    expect(problems, `page problems: ${problems.join(' | ')}`).toEqual([])
  })
})
