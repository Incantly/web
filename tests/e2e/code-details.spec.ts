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

async function insertViaSlash(page: Page, query: string) {
  await page.keyboard.press('Enter')
  for (const ch of query) await page.keyboard.type(ch, { delay: 25 })
  await page.waitForTimeout(800)
}

test.describe('code highlight and details', () => {
  test('highlighted code block and collapsible details persist', async ({ page }: { page: Page }) => {
    const problems = await captureProblems(page, async () => {
      await openNote(page)

      // --- Code block with syntax highlighting ---
      await insertViaSlash(page, '/code block')
      await expect(page.locator('.incantly-document-slash-menu [role="menuitem"] strong').first()).toHaveText('Code block')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      expect(await page.locator('.ProseMirror pre').count()).toBe(1)
      await page.keyboard.type('const greeting = "hi";', { delay: 15 })
      await page.waitForTimeout(400)
      // Select the code line so the bubble toolbar (with the language picker) appears.
      await page.keyboard.press('Shift+Home')
      await page.waitForTimeout(500)
      const languagePicker = page.getByRole('combobox', { name: 'Code language' })
      await expect(languagePicker).toBeVisible()
      await languagePicker.selectOption('javascript')
      await page.waitForTimeout(600)
      const keywordCount = await page.locator('.ProseMirror pre code .hljs-keyword').count()
      check('code-details', 'javascript highlights keywords', keywordCount >= 1, `hljs-keyword count=${keywordCount}`)
      expect(keywordCount).toBeGreaterThanOrEqual(1)
      const tokenColor = await page.locator('.ProseMirror pre code .hljs-keyword').first().evaluate((el) => getComputedStyle(el).color)
      const bodyColor = await page.locator('.ProseMirror p').first().evaluate((el) => getComputedStyle(el).color)
      check('code-details', 'keyword token color differs from body', tokenColor !== bodyColor, `${tokenColor} vs ${bodyColor}`)
      expect(tokenColor).not.toBe(bodyColor)
      await page.keyboard.press('Escape')
      await shot(page, 'code-details/highlight')

      // --- Details section ---
      await page.locator('.ProseMirror p').first().click()
      await page.waitForTimeout(300)
      await insertViaSlash(page, '/details')
      await expect(page.locator('.incantly-document-slash-menu [role="menuitem"] strong').first()).toHaveText('Details')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      expect(await page.locator('.ProseMirror [data-type="details"]').count()).toBe(1)
      check('code-details', 'details starts closed', await page.locator('.ProseMirror [data-type="details"].is-open').count() === 0, 'closed by default')
      expect(await page.locator('.ProseMirror [data-type="details"].is-open').count()).toBe(0)
      const toggle = page.getByRole('button', { name: /details content/ })
      await expect(toggle).toBeVisible()
      await toggle.click()
      await page.waitForTimeout(500)
      const openNow = await page.locator('.ProseMirror [data-type="details"].is-open').count()
      check('code-details', 'details toggles open', openNow === 1, `is-open count=${openNow}`)
      expect(openNow).toBe(1)
      await page.locator('.ProseMirror [data-type="details"] summary').click()
      await page.waitForTimeout(300)
      await page.keyboard.type('Research question', { delay: 15 })
      await page.locator('.ProseMirror [data-type="detailsContent"] p').click()
      await page.waitForTimeout(300)
      await page.keyboard.type('Hidden answer lives here', { delay: 15 })
      await page.waitForTimeout(400)
      const bodyVisible = await page.locator('.ProseMirror [data-type="detailsContent"]').first().evaluate((el) => getComputedStyle(el).display)
      check('code-details', 'details body visible when open', bodyVisible !== 'none', `display=${bodyVisible}`)
      expect(bodyVisible).not.toBe('none')
      await shot(page, 'code-details/details-open')

      // --- Reload: both survive the canonical round trip ---
      await page.waitForTimeout(1200)
      await page.reload({ waitUntil: 'networkidle' })
      const editorAfter = await openNote(page)
      const docText = await editorAfter.innerText()
      check('code-details', 'code text persists after reload', docText.includes('const greeting'), docText.slice(0, 80))
      expect(docText).toContain('const greeting')
      check('code-details', 'highlighting persists after reload', await page.locator('.ProseMirror pre code .hljs-keyword').count() >= 1, 'hljs-keyword present')
      expect(await page.locator('.ProseMirror pre code .hljs-keyword').count()).toBeGreaterThanOrEqual(1)
      check('code-details', 'details summary persists after reload', docText.includes('Research question'), 'summary present')
      expect(docText).toContain('Research question')
      check('code-details', 'details body persists after reload', docText.includes('Hidden answer lives here'), 'body present')
      expect(docText).toContain('Hidden answer lives here')
      check('code-details', 'details open state persists after reload', await page.locator('.ProseMirror [data-type="details"].is-open').count() === 1, 'is-open present')
      expect(await page.locator('.ProseMirror [data-type="details"].is-open').count()).toBe(1)
      await shot(page, 'code-details/persisted')
    })

    check('code-details', 'zero console/page/http errors', problems.length === 0, problems.slice(0, 3).join(' | '))
    expect(problems, `page problems: ${problems.join(' | ')}`).toEqual([])
  })
})
