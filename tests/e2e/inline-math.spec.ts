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

test.describe('inline math', () => {
  test('dollar formula converts, renders inline, and persists', async ({ page }: { page: Page }) => {
    const problems = await captureProblems(page, async () => {
      await openNote(page)

      // Type a formula; the convert button appears the moment it is closed.
      await page.keyboard.press('Enter')
      await page.keyboard.type('Energy is $E=mc^2$', { delay: 20 })
      await page.waitForTimeout(700)
      const convert = page.getByRole('button', { name: /Convert .* to math/ })
      await expect(convert).toBeVisible()
      const bubbleButtons = page.locator('.incantly-document-bubble-toolbar button')
      const bubbleCount = await bubbleButtons.count()
      check('inline-math', 'bubble shows only the convert button', bubbleCount === 1, `buttons=${bubbleCount}`)
      expect(bubbleCount).toBe(1)
      await expect(page.getByRole('button', { name: 'Bold' })).toHaveCount(0)
      await shot(page, 'inline-math-convert-offer')
      await convert.click()
      // Instant: the node must exist on the very next frame, no waiting.
      await expect(page.locator('.ProseMirror [data-type="inline-math"]')).toHaveCount(1, { timeout: 2000 })

      const inlineCount = await page.locator('.ProseMirror [data-type="inline-math"]').count()
      check('inline-math', 'formula converts to inline math node', inlineCount === 1, `count=${inlineCount}`)
      expect(inlineCount).toBe(1)
      const latexAttr = await page.locator('.ProseMirror [data-type="inline-math"]').first().getAttribute('data-latex')
      check('inline-math', 'dollars stripped, latex kept', latexAttr === 'E=mc^2', String(latexAttr))
      expect(latexAttr).toBe('E=mc^2')
      expect(await page.locator('.ProseMirror [data-type="inline-math"] .katex').count()).toBeGreaterThanOrEqual(1)
      await page.keyboard.type(' here', { delay: 15 })
      await page.waitForTimeout(300)
      const leftover = await page.locator('.ProseMirror').innerText()
      check('inline-math', 'sentence flows around the formula', leftover.includes('Energy is') && leftover.includes('here'), leftover.slice(0, 60))
      await shot(page, 'inline-math-rendered')

      // Edit the formula through the bubble LaTeX input.
      await page.locator('.ProseMirror [data-type="inline-math"]').click()
      await page.waitForTimeout(500)
      const latexInput = page.getByRole('textbox', { name: 'Math formula (LaTeX)' })
      await expect(latexInput).toBeVisible()
      const mathBubbleButtons = await page.locator('.incantly-document-bubble-toolbar button').count()
      check('inline-math', 'selected formula shows only its editor', mathBubbleButtons === 0, `buttons=${mathBubbleButtons}`)
      expect(mathBubbleButtons).toBe(0)
      await latexInput.fill('a^2+b^2=c^2')
      await page.waitForTimeout(600)
      expect(await page.locator('.ProseMirror [data-type="inline-math"]').first().getAttribute('data-latex')).toBe('a^2+b^2=c^2')
      // Real keystrokes (not fill): focus must stay in the box while typing.
      await latexInput.fill('')
      await latexInput.pressSequentially('a^2', { delay: 60 })
      await page.waitForTimeout(400)
      expect(await page.locator('.ProseMirror [data-type="inline-math"]').first().getAttribute('data-latex')).toBe('a^2')
      expect(await latexInput.evaluate((el) => el.matches(':focus'))).toBe(true)
      // Black-border regression gate: focused input shows no outline.
      const focusedOutline = await latexInput.evaluate((el) => {
        (el as HTMLElement).focus()
        return getComputedStyle(el).outlineStyle
      })
      check('inline-math', 'formula box has no focus outline', focusedOutline === 'none', `outline=${focusedOutline}`)
      expect(focusedOutline).toBe('none')
      await shot(page, 'inline-math-box-no-border')
      // Leave the box before continuing: subsequent typing must land in the
      // document, not in the LaTeX input.
      await latexInput.evaluate((el) => (el as HTMLElement).blur())
      await page.locator('.ProseMirror > p').last().click()
      await page.waitForTimeout(300)
      await page.keyboard.press('Escape')

      // False positive: plain currency must not offer conversion.
      await page.keyboard.press('Enter')
      await page.keyboard.type('$20 and $30', { delay: 20 })
      await page.waitForTimeout(700)
      // Caret sits after "$30" — outside any $...$ span, so no offer.
      await expect(page.getByRole('button', { name: /Convert .* to math/ })).toHaveCount(0)
      check('inline-math', 'currency does not offer conversion', true, 'no button for $20 and $30')

      // Reload: the formula survives the canonical round trip.
      await page.waitForTimeout(1200)
      await page.reload({ waitUntil: 'networkidle' })
      await openNote(page)
      const latexAfter = await page.locator('.ProseMirror [data-type="inline-math"]').first().getAttribute('data-latex')
      check('inline-math', 'inline math persists after reload', latexAfter === 'a^2', String(latexAfter))
      expect(latexAfter).toBe('a^2')
      expect(await page.locator('.ProseMirror [data-type="inline-math"] .katex').count()).toBeGreaterThanOrEqual(1)
      await shot(page, 'inline-math-persisted')
    })

    check('inline-math', 'zero console/page/http errors', problems.length === 0, problems.slice(0, 3).join(' | '))
    expect(problems, `page problems: ${problems.join(' | ')}`).toEqual([])
  })
})
