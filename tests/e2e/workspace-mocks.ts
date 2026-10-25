import type { Page, Route } from '@playwright/test'

const user = { id: 'user-e2e', name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
const emptyPage = { items: [], nextCursor: null }

/**
 * Opens the workspace with a signed-in session and every `/v1/*` call answered locally (empty
 * lists by default), so specs never reach a real backend. Register specific routes after this.
 */
export async function openMockedWorkspace(page: Page, setup?: (page: Page) => Promise<void>) {
  await page.context().addCookies([{ name: 'better-auth.session_token', value: 'e2e', domain: 'localhost', path: '/' }])
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: { user, session: { id: 'session-e2e', userId: user.id, expiresAt: '2099-01-01T00:00:00.000Z' } } }))
  await page.route('**/v1/**', (route: Route) => route.fulfill(route.request().method() === 'GET' ? { json: emptyPage } : { status: 204 }))
  await setup?.(page)
  await page.goto('/notes')
  await page.getByRole('region', { name: 'Workspace content' }).waitFor()
}
