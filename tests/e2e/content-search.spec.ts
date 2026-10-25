import { expect, test } from '@playwright/test'
import { check } from './artifacts'
import { openMockedWorkspace } from './workspace-mocks'

const citation = { noteId: null, noteRevisionId: null, sourceVersionId: 'v1', endBlockId: 'b1', page: 4, startMs: null, endMs: null, assetId: 'asset:pdf', sourceKind: 'FILE' }
const result = {
  manifestId: 'm1', sufficiency: 'SUFFICIENT', degraded: true, stale: false, sensitivity: 'PRIVATE',
  evidence: [
    { evidenceId: 'E1', tokenCount: 9, text: 'Mitochondria produce ATP through respiration.', citation: { ...citation, kind: 'SOURCE', sourceId: 's1', title: 'Cell biology handout', headingPath: ['Cells'], blockId: 'pdf1:4:0', locator: { type: 'PAGE', page: 4 } } },
    { evidenceId: 'E2', tokenCount: 5, text: '<b>Not bold</b> ATP is energy.', citation: { ...citation, kind: 'NOTE', sourceId: null, noteId: 'n1', title: 'Biology notes', headingPath: [], blockId: 'node:a', page: null, assetId: null, sourceKind: null, locator: { type: 'BLOCK' } } },
  ],
}

test('content search shows cited passages and waits out the rate limit', async ({ page }) => {
  const bodies: unknown[] = []
  await openMockedWorkspace(page, async (current) => {
    await current.route('**/v1/context/preview', (route) => {
      bodies.push(route.request().postDataJSON())
      return bodies.length === 1 ? route.fulfill({ json: result }) : route.fulfill({ status: 429, headers: { 'Retry-After': '3' }, json: { code: 'RATE_LIMITED' } })
    })
  })

  await page.keyboard.press('ControlOrMeta+k')
  const search = page.getByLabel('Search', { exact: true })
  await search.fill('What do mitochondria produce?')
  await search.press('Enter')

  const results = page.getByRole('region', { name: 'Cell biology handout' })
  await expect(results.getByText('Page 4')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Biology notes' }).getByText('<b>Not bold</b> ATP is energy.')).toBeVisible()
  await expect(page.getByText(/keyword only/)).toBeVisible()
  expect(bodies[0]).toEqual({ scope: 'LIBRARY', query: 'What do mitochondria produce?' })
  check('content-search', 'passages are grouped by source with page locators, rendered as text', true)

  await search.press('Enter')
  await expect(page.getByText('You can search again in 3 s')).toBeVisible()
  await expect(page.getByRole('button', { name: /Wait \d s/ })).toBeDisabled()
  expect(bodies).toHaveLength(2)
  check('content-search', '429 shows a Retry-After countdown instead of retrying', true)
})
