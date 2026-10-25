export type AuthField = 'email' | 'otp'
/** `waitlist`: sign-up is invite-only and this email is not approved yet. */
export type AuthProblem = { message: string; field?: AuthField; waitlist?: boolean }

export const WAITLIST_ONLY_PROBLEM: AuthProblem = {
  waitlist: true,
  message: 'Incantly is invite-only for now. Join the waitlist and we’ll email you when your spot opens.',
}
type AuthStep = 'send' | 'verify' | 'google'

/** Shape of `result.error` returned by the Better Auth client. */
export type AuthClientError = { code?: string; status?: number; message?: string }

function waitText(seconds: number | undefined) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return 'a minute'
  if (seconds < 60) return `${Math.ceil(seconds)} seconds`
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? 'a minute' : `${minutes} minutes`
}

/** Reads `Retry-After` / `X-Retry-After` from a failed auth response. */
export function retryAfterSeconds(response: Response | undefined) {
  const value = response?.headers.get('Retry-After') ?? response?.headers.get('X-Retry-After')
  const seconds = value ? Number(value) : NaN
  return Number.isFinite(seconds) ? seconds : undefined
}

/** Maps backend and Better Auth error codes to copy a person can act on. */
export function describeAuthError(error: AuthClientError, step: AuthStep, retryAfter?: number): AuthProblem {
  switch (error.code) {
    case 'INVALID_OTP':
      return { field: 'otp', message: 'That code doesn’t match. Check the latest email and try again.' }
    case 'OTP_EXPIRED':
      return { field: 'otp', message: 'That code has expired. Request a new one below.' }
    case 'TOO_MANY_ATTEMPTS':
      return { field: 'otp', message: 'Too many incorrect attempts. Request a new code to try again.' }
    case 'INVALID_EMAIL':
      return { field: 'email', message: 'Enter a valid email address, like name@example.com.' }
    case 'RATE_LIMITED':
      return { message: `Too many attempts. Please wait ${waitText(retryAfter)} and try again.` }
    case 'WAITLIST_ONLY':
      return WAITLIST_ONLY_PROBLEM
    case 'INVALID_REDIRECT':
      return { message: 'That sign-in link isn’t allowed. Start again from this page.' }
    case 'AUTH_UNAVAILABLE':
    case 'UNTRUSTED_PROXY':
    case 'UNTRUSTED_ORIGIN':
      return { message: 'Sign-in is temporarily unavailable. Please try again in a few minutes.' }
  }
  if (error.status === 429) return { message: `Too many attempts. Please wait ${waitText(retryAfter)} and try again.` }
  if (error.status && error.status >= 500) return { message: 'Something went wrong on our side. Please try again in a few minutes.' }
  if (step === 'verify') return { field: 'otp', message: 'We couldn’t verify that code. Request a new one and try again.' }
  if (step === 'google') return { message: 'Google sign-in couldn’t start. Please try again or use email.' }
  return { message: 'We couldn’t send a code. Please try again shortly.' }
}

/** Errors thrown before a response arrives: offline, DNS, timeout. */
export function describeNetworkError(cause: unknown): AuthProblem {
  const name = cause instanceof Error ? cause.name : ''
  if (name === 'TimeoutError' || name === 'AbortError') return { message: 'The request took too long. Check your connection and try again.' }
  return { message: 'We can’t reach Incantly right now. Check your connection and try again.' }
}
