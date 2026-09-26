import { expect, test } from '@playwright/test'
import { captureProblems, check, shot } from './artifacts'

async function openNote(page) {
  await page.goto('/dashboard', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Why cities stay warm/i }).first().click()
  await page.waitForTimeout(2500)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  // readiness gate: probe character must echo before interacting
  await page.keyboard.type('z')
  await page.waitForTimeout(400)
  expect(await editor.innerText()).toContain('z')
  await page.keyboard.press('Backspace')
  return editor
}

test.describe('slash menu custom queries', () => {
  test('every reported query matches and inserts', async ({ page }) => {
    const problems = await captureProblems(page, async () => {
      const editor = await openNote(page)

      const cases = [
        { query: '/h1', want: 'Heading 1', assert: () => page.locator('.ProseMirror h1').count() },
        { query: '/headings', want: 'Heading 1', assert: () => page.locator('.ProseMirror h1, .ProseMirror h2').count() },
        { query: '/number lists', want: 'Numbered list', assert: () => page.locator('.ProseMirror ol').count() },
        { query: '/check list', want: 'Checklist', assert: () => page.locator('.ProseMirror [data-type="checklist"]').count() },
        { query: '/ordered list', want: 'Numbered list', assert: () => page.locator('.ProseMirror ol').count() },
        { query: '/paragraph', want: 'Paragraph', base: 0, assert: async () => ((await page.locator('.incantly-document-slash-menu').count()) === 0 && !(await page.locator('.ProseMirror').innerText()).includes('/paragraph') ? 1 : 0) },
      ]

      for (const [index, c] of cases.entries()) {
        const before = 'base' in c ? c.base : await c.assert()
        await page.keyboard.press('Enter')
        for (const ch of c.query) {
          await page.keyboard.type(ch, { delay: 30 })
        }
        await page.waitForTimeout(900)
        const labels = await page
          .locator('.incantly-document-slash-menu [role="menuitem"] strong')
          .allInnerTexts()
        if (index === 0) await shot(page, 'slash-menu-open')
        const matched = labels.length > 0 && labels[0] === c.want
        check('slash-menu', `menu matches ${c.query}`, matched, JSON.stringify(labels.slice(0, 2)))
        expect(labels[0], `menu match for ${c.query}`).toBe(c.want)
        await page.keyboard.press('Enter')
        await page.waitForTimeout(600)
        const after = await c.assert()
        check('slash-menu', `insert via ${c.query}`, after > before, `count ${before}->${after}`)
        expect(after, `insert for ${c.query}`).toBeGreaterThan(before)
        // leave checklist items non-empty so schema keeps them
        if (c.query === '/check list') {
          await page.keyboard.type('x')
          await page.waitForTimeout(300)
        }
      }
      await shot(page, 'slash-menu-inserts')
    })

    check('slash-menu', 'zero console/page/http errors', problems.length === 0, problems.slice(0, 3).join(' | '))
    expect(problems, `page problems: ${problems.join(' | ')}`).toEqual([])
  })
})
