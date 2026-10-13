import { expect, test } from '@playwright/test'
import { captureProblems, check, shot } from './artifacts'

test.describe('landing', () => {
  test('loads with hero, footer, and zero errors', async ({ page }) => {
    const problems = await captureProblems(page, async () => {
      await page.goto('/', { waitUntil: 'networkidle' })
      await expect(page).toHaveTitle(/Incantly/)
    })

    const main = page.locator('main#top')
    await expect(main).toBeVisible({ timeout: 15000 })
    check('landing', 'hero main renders', await main.count() === 1)

    const footer = page.locator('footer')
    check('landing', 'footer renders', (await footer.count()) >= 1)

    await shot(page, 'landing/loaded')
    check('landing', 'screenshot captured', true, 'e2e-artifacts/screenshots/landing.png')

    check('landing', 'no console/page/http errors', problems.length === 0, problems.slice(0, 3).join(' | '))
    expect(problems, `page problems: ${problems.join(' | ')}`).toEqual([])
  })
})
