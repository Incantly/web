import { createAuthClient } from 'better-auth/react'
import { emailOTPClient } from 'better-auth/client/plugins'


export const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true'

export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
  fetchOptions: { credentials: 'include', timeout: 15_000 },
})
