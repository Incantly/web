import { createAuthClient } from 'better-auth/react'
import { emailOTPClient } from 'better-auth/client/plugins'

const baseURL = process.env.NEXT_PUBLIC_AUTH_BASE_URL ?? 'http://localhost:3000'

export const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true'

export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient()],
})
