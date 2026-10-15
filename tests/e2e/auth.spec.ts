import { expect, test } from '@playwright/test'
import { check, shot } from './artifacts'

test('OTP signup and responsive authentication', async ({ page }) => {
  await page.route('**/api/auth/email-otp/send-verification-otp', route => route.fulfill({ json: { success: true } }))
  await page.route('**/api/auth/sign-in/email-otp', route => route.fulfill({ status: 400, json: { code: 'INVALID_OTP', message: 'Invalid code' } }))
  await page.goto('/auth/signup')
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Resend verification email' })).toHaveCount(0)
  await page.getByLabel('First name').fill('Ada')
  await page.getByLabel('Last name').fill('Lovelace')
  await page.getByLabel('Email address').fill('ada@example.com')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email.' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled()
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await shot(page, 'otp-auth/code-' + width)
    check('otp-auth', 'no overflow at ' + width, true)
  }
  await page.getByLabel('Six-digit code').fill('123456')
  await page.getByRole('button', { name: 'Verify and continue' }).click()
  await expect(page.locator('p[role="alert"]')).toContainText('invalid or expired')
  check('otp-auth', 'invalid OTP produces visible retry error', true)
  await page.getByRole('button', { name: 'Back to sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New here? Create an account' })).toBeVisible()
})
