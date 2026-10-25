import { expect, test } from '@playwright/test'
import { check } from './artifacts'
import { openMockedWorkspace } from './workspace-mocks'

test('offline banner appears and confirms reconnecting', async ({ page, context }) => {
  await openMockedWorkspace(page)
  await context.setOffline(true)
  await expect(page.getByText(/You’re offline/)).toBeVisible()
  check('offline-banner', 'going offline shows the banner', true)

  await context.setOffline(false)
  await expect(page.getByText('Back online. Syncing your changes…')).toBeVisible()
  await expect(page.getByText(/You’re offline/)).toHaveCount(0)
  check('offline-banner', 'reconnecting replaces it with a back-online notice', true)
})
