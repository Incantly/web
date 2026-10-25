import { expect, test } from '@playwright/test'
import { check } from './artifacts'
import { openMockedWorkspace } from './workspace-mocks'

const job = { id: '7f0c3c2e-0b7a-4c55-9a35-8d7f0b9f1a11', sourceType: 'url', status: 'queued', targetNoteId: null, errorCode: null, attempts: 0, createdAt: '2026-10-21T10:00:00.000Z', startedAt: null, completedAt: null, failedAt: null }

test('a queued import can be cancelled and is still tracked after reload', async ({ page }) => {
  let status = 'queued'
  await openMockedWorkspace(page, async (current) => {
    await current.route('**/v1/imports/urls', (route) => route.fulfill({ status: 201, json: job }))
    await current.route(`**/v1/imports/${job.id}`, (route) => {
      if (route.request().method() === 'DELETE') { status = 'cancelled'; return route.fulfill({ status: 204 }) }
      return route.fulfill({ json: { ...job, status } })
    })
  })

  await page.getByRole('button', { name: 'New' }).first().click()
  await page.getByRole('menuitem', { name: 'Import from web address' }).click()
  await page.getByLabel('Web address').fill('https://example.org/article?id=secret')
  await page.getByRole('button', { name: 'Import', exact: true }).click()

  const tray = page.getByRole('region', { name: 'Imports' })
  await expect(tray.getByText('example.org', { exact: true })).toBeVisible()
  await expect(tray.getByText('Waiting to start')).toBeVisible()
  const stored = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('incantly-imports:')).map(([, value]) => value).join(''))
  expect(stored).toContain(job.id)
  expect(stored).not.toContain('secret')
  check('imports', 'only the import ID and host are stored on the device', true)

  await tray.getByRole('button', { name: 'Cancel' }).click()
  await expect(tray.getByText('Cancelled')).toBeVisible()
  await expect(tray.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
  check('imports', 'cancel while queued, then Cancel disappears', true)

  await page.reload()
  await expect(page.getByRole('region', { name: 'Imports' }).getByText('Cancelled')).toBeVisible()
  check('imports', 'a reload resumes tracking the import', true)
})
