import { expect, test } from '@playwright/test'
import { check, shot } from './artifacts'

test.describe('authentication', () => {
  test('requests and resends an email sign-in code', async ({ page }) => {
    const emailRequests: string[] = []
    await page.route('**/api/auth/email-otp/send-verification-otp', async (route) => {
      emailRequests.push(route.request().postData() ?? '')
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })

    await page.goto('/auth')
    await page.getByLabel('Email address').fill('learner@example.com')
    await page.getByRole('button', { name: 'Continue with email' }).click()

    await expect(page.getByRole('heading', { name: 'Check your email.' })).toBeVisible()
    await expect(page.getByText('If this email can sign in, a six-digit code is on its way.')).toBeVisible()
    check('auth', 'email code request submitted', emailRequests.length === 1)
    check('auth', 'email request uses the sign-in OTP type', emailRequests[0]?.includes('"type":"sign-in"') ?? false)

    await page.getByRole('button', { name: /Resend in/ }).waitFor()
    await shot(page, 'auth/code-pending')
  })
})
