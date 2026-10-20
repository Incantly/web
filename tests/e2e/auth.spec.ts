import { expect, test } from '@playwright/test'
import { check, shot } from './artifacts'

test('OTP signup and responsive authentication', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: null }))
  await page.route('**/api/auth/email-otp/send-verification-otp', route => route.fulfill({ json: { success: true } }))
  await page.route('**/api/auth/sign-in/email-otp', route => route.fulfill({ status: 400, json: { code: 'INVALID_OTP', message: 'Invalid OTP' } }))
  await page.goto('/auth/signup')
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
  await page.getByLabel('First name').fill('Ada')
  await page.getByLabel('Last name').fill('Lovelace')
  await page.getByLabel('Email address').fill('ada@example.com')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email.' })).toBeVisible()
  await expect(page.getByText('We sent a six-digit code to ada@example.com')).toBeVisible()
  await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled()
  await expect(page.getByLabel('Six-digit code')).toBeFocused()
  await expect(page.getByLabel('Six-digit code')).toHaveValue('')
  check('auth-redesign', 'code field starts empty after email step', true)
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await shot(page, 'auth-redesign/code-' + width)
    check('auth-redesign', 'no overflow on code step at ' + width, true)
  }
  await page.getByLabel('Six-digit code').fill('123456')
  await page.getByRole('button', { name: 'Verify and continue' }).click()
  await expect(page.locator('#auth-error')).toContainText('doesn’t match')
  await expect(page.getByLabel('Six-digit code')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('We sent a six-digit code to ada@example.com')).toBeVisible()
  await shot(page, 'auth-redesign/invalid-code')
  check('auth-redesign', 'invalid OTP shows alert and marks the field invalid', true)

  await page.getByRole('button', { name: 'Use a different email' }).click()
  await expect(page.getByLabel('Email address')).toHaveValue('ada@example.com')
  await page.getByRole('button', { name: 'Sign in instead' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create an account' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  check('auth-redesign', 'mode switch and legal links render as controls', true)
  expect(consoleErrors.filter(text => !text.includes('400'))).toEqual([])
})

test('auth errors are specific and recoverable', async ({ page }) => {
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: null }))
  await page.route('**/api/auth/email-otp/send-verification-otp', route => route.fulfill({ status: 429, headers: { 'Retry-After': '45' }, json: { code: 'RATE_LIMITED' } }))
  await page.goto('/auth')
  await page.getByLabel('Email address').fill('ada@example.com')
  await page.getByRole('button', { name: 'Continue with email' }).click()
  await expect(page.locator('#auth-error')).toContainText('wait 45 seconds')
  await shot(page, 'auth-redesign/rate-limited')
  check('auth-redesign', 'rate limit shows wait time from Retry-After', true)

  await page.unroute('**/api/auth/email-otp/send-verification-otp')
  await page.route('**/api/auth/email-otp/send-verification-otp', route => route.fulfill({ status: 503, json: { code: 'AUTH_UNAVAILABLE' } }))
  await page.getByRole('button', { name: 'Continue with email' }).click()
  await expect(page.locator('#auth-error')).toContainText('temporarily unavailable')
  check('auth-redesign', 'backend outage shows unavailable message', true)

  await page.unroute('**/api/auth/email-otp/send-verification-otp')
  await page.route('**/api/auth/email-otp/send-verification-otp', route => route.abort('internetdisconnected'))
  await page.getByRole('button', { name: 'Continue with email' }).click()
  await expect(page.locator('#auth-error')).toContainText('can’t reach Incantly')
  check('auth-redesign', 'network failure shows connection message', true)

  await page.goto('/auth?error=oauth')
  await expect(page.locator('#auth-error')).toContainText('Google sign-in was cancelled')
  check('auth-redesign', 'OAuth error callback is explained', true)
})

test('signed-in visitors can continue or sign out', async ({ page }) => {
  let signedIn = true
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: signedIn ? { session: { id: 's1', userId: 'u1', expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: { id: 'u1', email: 'ada@example.com', name: 'Ada Lovelace' } } : null }))
  await page.route('**/api/auth/sign-out', route => { signedIn = false; return route.fulfill({ json: { success: true } }) })
  await page.goto('/auth')
  await expect(page.getByRole('heading', { name: 'You’re signed in.' })).toBeVisible()
  await expect(page.getByText('ada@example.com')).toBeVisible()
  await shot(page, 'auth-redesign/signed-in')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  check('auth-redesign', 'signed-in state offers continue and sign out', true)
})
