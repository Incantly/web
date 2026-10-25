import { apiFetch } from './client'

export type JoinWaitlist = { name: string; email: string }

/** `POST /v1/waitlist` (frontend-api-integration.md, "Waitlist and gated sign-up"). */
export const waitlistApi = {
  /**
   * Always answers the same for a new or an already-listed email, so never
   * tell the person which it was. One attempt: a 429 is shown, not waited out.
   */
  async join(body: JoinWaitlist) {
    await apiFetch<{ status: 'joined' }>('/v1/waitlist', { method: 'POST', body, maxAttempts: 1 })
  },
}
