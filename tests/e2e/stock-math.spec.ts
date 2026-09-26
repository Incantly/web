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

test.describe('stock math block', () => {
  test('katex math inserts, edits, and persists', async ({ page }: { page: Page }) => {
    const problems = await captureProblems(page, async () => {
      await openNote(page)

      await page.keyboard.press('Enter')
      for (const ch of '/math') await page.keyboard.type(ch, { delay: 25 })
      await page.waitForTimeout(800)
      await expect(page.locator('.incantly-document-slash-menu [role="menuitem"] strong').first()).toHaveText('Math block')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(600)
      expect(await page.locator('.ProseMirror [data-type="block-math"]').count()).toBe(1)

      // Click the math node so the bubble toolbar offers the LaTeX editor.
      await page.locator('.ProseMirror [data-type="block-math"]').click()
      await page.waitForTimeout(500)
      const latexInput = page.getByRole('textbox', { name: 'Math formula (LaTeX)' })
      await expect(latexInput).toBeVisible()
      const mathBubbleButtons = await page.locator('.incantly-document-bubble-toolbar button').count()
      check('stock-math', 'selected formula shows only its editor', mathBubbleButtons === 0, `buttons=${mathBubbleButtons}`)
      expect(mathBubbleButtons).toBe(0)
      await latexInput.fill('x^2 + y^2 = z^2')
      await page.waitForTimeout(600)
      const katexText = await page.locator('.ProseMirror [data-type="block-math"] .katex').first().innerText().catch(() => '')
      const latexAttr = await page.locator('.ProseMirror [data-type="block-math"]').first().getAttribute('data-latex')
      check('stock-math', 'katex renders the formula', katexText.replace(/\s+/g, '').length > 10 && latexAttr === 'x^2 + y^2 = z^2', `${latexAttr} / ${katexText.slice(0, 40)}`)
      expect(latexAttr).toBe('x^2 + y^2 = z^2')
      expect(katexText.replace(/\s+/g, '').length).toBeGreaterThan(10)
      await page.keyboard.press('Escape')
      await shot(page, 'stock-math')

      await page.waitForTimeout(1200)
      await page.reload({ waitUntil: 'networkidle' })
      await openNote(page)
      const latexAfter = await page.locator('.ProseMirror [data-type="block-math"]').first().getAttribute('data-latex')
      check('stock-math', 'math persists after reload', latexAfter === 'x^2 + y^2 = z^2', String(latexAfter))
      expect(latexAfter).toBe('x^2 + y^2 = z^2')
      expect(await page.locator('.ProseMirror [data-type="block-math"] .katex').count()).toBeGreaterThanOrEqual(1)
      await shot(page, 'stock-math-persisted')
    })

    check('stock-math', 'zero console/page/http errors', problems.length === 0, problems.slice(0, 3).join(' | '))
    expect(problems, `page problems: ${problems.join(' | ')}`).toEqual([])
  })
})
