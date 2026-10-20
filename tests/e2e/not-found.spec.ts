import { expect, test } from '@playwright/test'
import { captureProblems, check, shot } from './artifacts'

const MISSING = '/this-page-does-not-exist'

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]

test.describe('not-found', () => {
  test('unknown route renders the branded 404 with a 404 status', async ({ page }) => {
    let status = 0
    const problems = await captureProblems(page, async () => {
      const response = await page.goto(MISSING, { waitUntil: 'networkidle' })
      status = response?.status() ?? 0
    })

    check('not-found', 'responds with HTTP 404', status === 404, `status ${status}`)
    expect(status).toBe(404)

    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    await expect(page).toHaveTitle('Page not found — Incantly')
    check('not-found', 'heading and title render', true)

    await expect(page.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
    await expect(page.getByRole('link', { name: 'Open workspace' })).toHaveAttribute('href', '/workspace')
    check('not-found', 'recovery links point home and to workspace', true)

    // The document itself is the expected 404, and Chrome logs it as a console
    // error without a URL. Anything else is a real problem.
    const otherHttp = problems.filter((problem) => problem.startsWith('http-') && !problem.includes(MISSING))
    const unexpected = problems.filter((problem) => {
      if (problem.includes(MISSING)) return false
      const documentLog = problem.startsWith('console: Failed to load resource') && problem.includes('404')
      return !(documentLog && otherHttp.length === 0)
    })
    check('not-found', 'no console/page/http errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '))
    expect(unexpected).toEqual([])
  })

  for (const viewport of VIEWPORTS) {
    test(`fits and keeps 44px targets at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(MISSING, { waitUntil: 'networkidle' })

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      check('not-found', `no horizontal scroll at ${viewport.width}px`, overflow <= 0, `overflow ${overflow}px`)
      expect(overflow).toBeLessThanOrEqual(0)

      for (const name of ['Incantly home', 'Back to home', 'Open workspace']) {
        const box = await page.getByRole('link', { name }).boundingBox()
        const ok = !!box && box.width >= 44 && box.height >= 44
        check('not-found', `"${name}" target ≥44px at ${viewport.width}px`, ok, box ? `${Math.round(box.width)}×${Math.round(box.height)}` : 'missing')
        expect(ok).toBe(true)
      }

      await shot(page, `not-found/viewport-${viewport.width}`)
    })
  }
})
