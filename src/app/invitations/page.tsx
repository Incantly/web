import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { noIndex } from '../../lib/brand/siteMetadata'

export const metadata: Metadata = { title: 'Invitations · Incantly', ...noIndex }

/**
 * The invitation email links here with no token. Signed-in users land on the inbox;
 * signed-out users pass through sign-in first (via the `/notes` guard) and return here.
 */
export default function InvitationsPage() {
  redirect('/notes?view=invitations')
}
