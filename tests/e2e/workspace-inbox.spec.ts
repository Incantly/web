import { expect, test, type Page } from '@playwright/test'
import { check } from './artifacts'

async function openWorkspace(page: Page) {
  await page.context().addCookies([{ name: 'better-auth.session_token', value: 'e2e', domain: 'localhost', path: '/' }])
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: null }))
  await page.goto('/notes')
}

test('inbox is a top-bar popover with tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openWorkspace(page)
  await expect(page.getByRole('button', { name: 'Search workspace' })).toHaveCount(0)
  await expect(page.locator('#workspace-sidebar').getByRole('button', { name: /^Inbox/ })).toHaveCount(0)
  check('workspace-inbox', 'top-bar search icon and sidebar inbox are gone', true)

  const trigger = page.getByRole('button', { name: 'Inbox, 3 new' })
  const popover = page.getByRole('dialog', { name: 'Inbox' })
  await expect(popover).toBeHidden()
  await trigger.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('tab', { name: /All/ })).toBeFocused()
  await expect(popover.getByRole('listitem')).toHaveCount(3)
  const box = await popover.boundingBox()
  const triggerBox = await trigger.boundingBox()
  expect(box && triggerBox && box.y > triggerBox.y + triggerBox.height - 1).toBe(true)
  expect(box && triggerBox && Math.abs(box.x + box.width - (triggerBox.x + triggerBox.width)) < 2).toBe(true)
  check('workspace-inbox', 'popover drops down right-aligned under the inbox button', true)

  await page.keyboard.press('ArrowRight')
  await expect(popover.getByRole('tab', { name: /Today/ })).toHaveAttribute('aria-selected', 'true')
  await expect(popover.getByRole('listitem')).toHaveCount(1)
  await popover.getByRole('button', { name: 'Mark done' }).click()
  await expect(popover.getByText('Nothing new today')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inbox, 2 new' })).toBeVisible()
  check('workspace-inbox', 'tabs filter, keyboard arrows switch tabs, empty state per tab', true)

  await page.mouse.click(700, 700)
  await expect(popover).toBeHidden()
  await page.getByRole('button', { name: 'Inbox, 2 new' }).click()
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(page.getByRole('button', { name: 'Inbox, 2 new' })).toBeFocused()
  check('workspace-inbox', 'outside click and Escape close it; focus returns to the button', true)

  await page.getByRole('button', { name: 'Inbox, 2 new' }).click()
  await popover.getByRole('tab', { name: /All/ }).click()
  await popover.getByRole('button', { name: 'Make a note' }).first().click()
  await expect(popover).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Something to read')
  await expect(page.getByRole('button', { name: 'Inbox, 1 new' })).toBeVisible()
  check('workspace-inbox', 'Make a note opens the note; inbox stays available on the note view', true)
})

test('inbox popover fits small screens', async ({ page }) => {
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 800 })
    await openWorkspace(page)
    await page.getByRole('button', { name: 'Inbox, 3 new' }).click()
    const popover = page.getByRole('dialog', { name: 'Inbox' })
    await expect(popover).toBeVisible()
    const box = await popover.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    check('workspace-inbox', `popover inside viewport, no overflow at ${width}`, true)
  }
})

test('inbox card keeps a fixed size and scrolls long lists', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openWorkspace(page)
  const popover = page.getByRole('dialog', { name: 'Inbox' })
  const panel = popover.getByRole('tabpanel')
  await page.getByRole('button', { name: 'Inbox, 3 new' }).click()
  await page.waitForTimeout(300) // let the open scale animation finish
  const fewHeight = (await popover.boundingBox())!.height

  await popover.getByRole('tab', { name: /Today/ }).click()
  await expect(popover.getByText('Nothing new today')).toHaveCount(0)
  await popover.getByRole('button', { name: 'Mark done' }).click()
  await expect(popover.getByText('Nothing new today')).toBeVisible()
  expect((await popover.boundingBox())!.height).toBe(fewHeight)
  check('workspace-inbox', 'empty state keeps the same card height', true)

  await popover.getByRole('tab', { name: /All/ }).click()
  // Fill the list: 20 rows rendered into the same panel must scroll, not grow the card.
  await panel.evaluate((node) => {
    const list = node.querySelector('ul')!
    const row = list.firstElementChild!
    for (let i = 0; i < 20; i++) list.appendChild(row.cloneNode(true))
  })
  expect((await popover.boundingBox())!.height).toBe(fewHeight)
  const scroll = await panel.evaluate((node) => ({ scrollable: node.scrollHeight > node.clientHeight, overflow: getComputedStyle(node).overflowY }))
  expect(scroll).toEqual({ scrollable: true, overflow: 'auto' })
  check('workspace-inbox', '20+ updates scroll inside a fixed-height card', true)
})

