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

test.describe('slash blocks insert and look distinct', () => {
  test('paragraph, headings, lists, quote, code, divider', async ({ page }) => {
    const problems = await captureProblems(page, async () => {
      const editor = await openNote(page)

      // H1: inserts, caret stays inside, and renders bigger than body text.
      await insertViaSlash(page, '/h1')
      await expect(page.locator('.incantly-document-slash-menu [role="menuitem"] strong').first()).toHaveText('Heading 1')
      if ((await page.locator('.incantly-document-slash-menu').count()) > 0) await shot(page, 'slash-blocks/menu-h1-open')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      await page.keyboard.type('Big Title', { delay: 15 })
      await page.waitForTimeout(300)
      const h1Count = await page.locator('.ProseMirror h1').count()
      check('slash-blocks', 'h1 inserts', h1Count === 1, `h1 count=${h1Count}`)
      expect(h1Count).toBe(1)
      const sizes = await page.evaluate(() => {
        const h1 = document.querySelector('.ProseMirror h1')
        const p = document.querySelector('.ProseMirror p')
        return {
          h1: h1 ? getComputedStyle(h1).fontSize : 'missing',
          p: p ? getComputedStyle(p).fontSize : 'missing',
        }
      })
      const h1Bigger = parseFloat(sizes.h1) > parseFloat(sizes.p)
      check('slash-blocks', 'h1 renders bigger than paragraph', h1Bigger, JSON.stringify(sizes))
      expect(h1Bigger, `h1 ${sizes.h1} vs p ${sizes.p}`).toBe(true)
      const caretInH1 = await page.evaluate(() => {
        const node = window.getSelection()?.anchorNode
        const el = node instanceof Element ? node : node?.parentElement
        return el?.closest('h1')?.tagName ?? 'none'
      })
      check('slash-blocks', 'caret stays in h1 after Enter', caretInH1 === 'H1', caretInH1)
      expect(caretInH1).toBe('H1')
      await shot(page, 'slash-blocks/h1')

      // H2: inserts and renders bigger than body text.
      await insertViaSlash(page, '/heading 2')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      await page.keyboard.type('Section subtitle', { delay: 15 })
      await page.waitForTimeout(300)
      const h2Count = await page.locator('.ProseMirror h2').count()
      check('slash-blocks', 'h2 inserts', h2Count >= 1, `h2 count=${h2Count}`)
      expect(h2Count).toBeGreaterThanOrEqual(1)
      const h2Size = await page.locator('.ProseMirror h2').first().evaluate((el) => getComputedStyle(el).fontSize)
      check('slash-blocks', 'h2 renders bigger than paragraph', parseFloat(h2Size) > parseFloat(sizes.p), `h2=${h2Size} p=${sizes.p}`)
      expect(parseFloat(h2Size)).toBeGreaterThan(parseFloat(sizes.p))
      await shot(page, 'slash-blocks/h2')

      // Bullet list: inserts with visible disc markers.
      await insertViaSlash(page, '/bullet')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      await page.keyboard.type('first dot', { delay: 15 })
      await page.waitForTimeout(300)
      const ulCount = await page.locator('.ProseMirror ul:not([data-type="checklist"])').count()
      check('slash-blocks', 'bullet list inserts', ulCount >= 1, `ul count=${ulCount}`)
      expect(ulCount).toBeGreaterThanOrEqual(1)
      const ulStyle = await page.locator('.ProseMirror ul:not([data-type="checklist"])').first().evaluate((el) => {
        const s = getComputedStyle(el)
        return `${s.listStyleType}|${s.paddingLeft}`
      })
      check('slash-blocks', 'bullet list shows markers', ulStyle.startsWith('disc') && !ulStyle.endsWith('|0px'), ulStyle)
      expect(ulStyle.startsWith('disc')).toBe(true)
      await shot(page, 'slash-blocks/bullet')

      // Numbered list: inserts with decimal markers.
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await insertViaSlash(page, '/numbered')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      await page.keyboard.type('first step', { delay: 15 })
      await page.waitForTimeout(300)
      const olCount = await page.locator('.ProseMirror ol').count()
      check('slash-blocks', 'numbered list inserts', olCount >= 1, `ol count=${olCount}`)
      expect(olCount).toBeGreaterThanOrEqual(1)
      const olStyle = await page.locator('.ProseMirror ol').first().evaluate((el) => {
        const s = getComputedStyle(el)
        return `${s.listStyleType}|${s.paddingLeft}`
      })
      check('slash-blocks', 'numbered list shows markers', olStyle.startsWith('decimal'), olStyle)
      expect(olStyle.startsWith('decimal')).toBe(true)
      await shot(page, 'slash-blocks/numbered')

      // Blockquote + code block + divider + paragraph: structural inserts.
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await insertViaSlash(page, '/quote')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      await page.keyboard.type('a passage aside', { delay: 15 })
      const quoteCount = await page.locator('.ProseMirror blockquote').count()
      check('slash-blocks', 'blockquote inserts', quoteCount >= 1, `blockquote=${quoteCount}`)
      expect(quoteCount).toBeGreaterThanOrEqual(1)

      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await insertViaSlash(page, '/code block')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      const codeCount = await page.locator('.ProseMirror pre').count()
      check('slash-blocks', 'code block inserts', codeCount >= 1, `pre=${codeCount}`)
      expect(codeCount).toBeGreaterThanOrEqual(1)

      await page.keyboard.press('Escape')
      await page.keyboard.press('Enter')
      await insertViaSlash(page, '/divider')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      const hrCount = await page.locator('.ProseMirror hr').count()
      check('slash-blocks', 'divider inserts', hrCount >= 1, `hr=${hrCount}`)
      expect(hrCount).toBeGreaterThanOrEqual(1)

      await page.keyboard.press('Enter')
      await insertViaSlash(page, '/paragraph')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      const slashGone = !(await editor.innerText()).includes('/paragraph')
      check('slash-blocks', 'slash query clears after paragraph insert', slashGone, slashGone ? 'cleared' : 'leftover slash text')
      expect(slashGone).toBe(true)
      await shot(page, 'slash-blocks/final')
    })

    check('slash-blocks', 'zero console/page/http errors', problems.length === 0, problems.slice(0, 3).join(' | '))
    expect(problems, `page problems: ${problems.join(' | ')}`).toEqual([])
  })
})
