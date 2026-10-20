import { expect, test, type Page } from '@playwright/test'
import { check } from './artifacts'

async function openWorkspace(page: Page) {
  // The proxy only checks for the cookie before rendering; the page itself is client-side.
  await page.context().addCookies([{ name: 'better-auth.session_token', value: 'e2e', domain: 'localhost', path: '/' }])
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: null }))
  await page.goto('/notes')
}

const iconX = (page: Page, name: string) => page.locator('#workspace-sidebar').getByRole('button', { name, exact: true }).locator('svg').first().evaluate(node => node.getBoundingClientRect().left)

test('desktop sidebar folds into an icon rail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openWorkspace(page)
  const rail = page.locator('#workspace-sidebar')
  await expect(rail.getByRole('button', { name: 'Incantly home' })).toBeVisible()
  await expect(page.getByText('Hi, Iteoluwakisi')).toHaveCount(0)
  await expect(rail.getByText('incantly', { exact: true })).toBeVisible()
  check('workspace-sidebar', 'header shows Incantly logo and name instead of greeting', true)

  const before = await iconX(page, 'Home')
  const sampling = rail.evaluate(node => new Promise<number[]>(resolve => {
    const widths: number[] = []
    const started = performance.now()
    const tick = () => { widths.push(node.getBoundingClientRect().width); if (performance.now() - started < 900) requestAnimationFrame(tick); else resolve(widths) }
    requestAnimationFrame(tick)
  }))
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await page.waitForTimeout(100)
  const widths = await sampling
  expect(widths.filter(width => width > 70 && width < 270).length).toBeGreaterThan(2)
  check('workspace-sidebar', 'width animates instead of snapping', true)

  await expect.poll(() => rail.evaluate(node => node.getBoundingClientRect().width)).toBe(64)
  for (const name of [/^Search/, /^Home$/, /^Settings$/, /^Incantly home$/]) await expect(rail.getByRole('button', { name }).first()).toBeVisible()
  expect(Math.abs((await iconX(page, 'Home')) - before)).toBeLessThan(1)
  check('workspace-sidebar', 'collapsed rail keeps icons in place', true)

  const content = page.getByRole('region', { name: 'Workspace content' })
  expect(await content.evaluate(node => node.getBoundingClientRect().left)).toBeLessThan(80)
  check('workspace-sidebar', 'content expands into freed space', true)

  await rail.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  check('workspace-sidebar', 'rail icons still navigate', true)

  await page.keyboard.press('ControlOrMeta+Backslash')
  await expect.poll(() => rail.evaluate(node => node.getBoundingClientRect().width)).toBe(280)
  check('workspace-sidebar', 'keyboard shortcut toggles rail', true)

  await page.setViewportSize({ width: 1024, height: 768 })
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect.poll(() => rail.evaluate(node => node.getBoundingClientRect().width)).toBe(64)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  check('workspace-sidebar', 'no overflow at 1024 collapsed', true)
})

test('mobile sheet shows the Incantly brand', async ({ page }) => {
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 800 })
    await openWorkspace(page)
    await page.getByRole('button', { name: 'Open sidebar' }).click()
    const sheet = page.locator('#workspace-mobile-sidebar')
    await expect(sheet.getByText('incantly', { exact: true })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Close sidebar' })).toBeVisible()
    await page.waitForTimeout(250)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    check('workspace-sidebar', `mobile sheet brand and no overflow at ${width}`, true)
  }
})

test('collapsed rail opens on hover and closes on leave unless pinned', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openWorkspace(page)
  const rail = page.locator('#workspace-sidebar')
  const width = () => rail.evaluate(node => node.getBoundingClientRect().width)
  const content = page.getByRole('region', { name: 'Workspace content' })
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect.poll(width).toBe(64)
  const contentLeft = await content.evaluate(node => node.getBoundingClientRect().left)

  await rail.getByRole('button', { name: /^Home$/ }).hover()
  await expect.poll(width).toBe(280)
  await expect(rail.getByText('incantly', { exact: true })).toBeVisible()
  await expect.poll(() => content.evaluate(node => node.getBoundingClientRect().left)).toBeGreaterThan(contentLeft + 200)
  check('workspace-sidebar', 'hovering the collapsed rail opens it and shifts the content aside', true)

  await page.mouse.move(900, 450)
  await expect.poll(width).toBe(64)
  await expect.poll(() => content.evaluate(node => node.getBoundingClientRect().left)).toBe(contentLeft)
  check('workspace-sidebar', 'content shifts back when the pointer leaves', true)
  
  await rail.getByRole('button', { name: /^Home$/ }).hover()
  await expect.poll(width).toBe(280)
  await expect(page.getByRole('button', { name: 'Keep sidebar open' })).toHaveCount(0)
  const toggle = page.getByRole('button', { name: 'Expand sidebar' })
  await toggle.hover()
  await page.waitForTimeout(400)
  expect(await width()).toBe(280)
  await toggle.click()
  await page.mouse.move(900, 450)
  await page.waitForTimeout(600)
  expect(await width()).toBe(280)
  expect(await content.evaluate(node => node.getBoundingClientRect().left)).toBeGreaterThan(270)
  check('workspace-sidebar', 'moving from the hovered rail to the existing toggle keeps it open, and clicking pins it', true)

  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect.poll(width).toBe(64)
  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await page.mouse.move(900, 450)
  await page.waitForTimeout(600)
  expect(await width()).toBe(280)
  check('workspace-sidebar', 'top-bar expand button pins the sidebar open', true)

  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect.poll(width).toBe(64)
  for (let i = 0; i < 8 && !(await rail.evaluate(node => node.contains(document.activeElement))); i++) await page.keyboard.press('Shift+Tab')
  await expect.poll(width).toBe(280)
  await page.keyboard.press('Escape')
  await expect.poll(width).toBe(64)
  check('workspace-sidebar', 'keyboard focus opens the rail and Escape closes it', true)
})

