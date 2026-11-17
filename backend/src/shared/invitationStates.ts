/**
 * Codes of invitations and guest documents, shared by the backend and the
 * React app. The clients turn them into words (later translated).
 *
 * Keep this file free of imports: the React app bundles it.
 */

export const INVITATION_STATUSES = ['staged', 'sent_email', 'sent_manually', 'waitlist', 'archived'] as const
export type InvitationStatus = (typeof INVITATION_STATUSES)[number]

export const INVITATION_RESPONSES = ['open', 'yes', 'no'] as const
export type InvitationResponse = (typeof INVITATION_RESPONSES)[number]

/**
 * A guest's hunting licence for a given hunt:
 * valid = checked by the manager and valid on the hunt day;
 * unchecked = uploaded, not checked yet; expired = expires before the hunt; missing = none.
 */
export const LICENCE_STATES = ['valid', 'unchecked', 'expired', 'missing'] as const
export type LicenceState = (typeof LICENCE_STATES)[number]

/** A guest's training certificate (Schießnachweis): valid = checked; unchecked; missing. */
export const CERTIFICATE_STATES = ['valid', 'unchecked', 'missing'] as const
export type CertificateState = (typeof CERTIFICATE_STATES)[number]

/** Whether the invitation link has gone out to the guest (by email or by hand). */
export function linkSent(status: InvitationStatus): boolean {
  return status === 'sent_email' || status === 'sent_manually'
}

export function licenceState(newest: { checked: boolean; expiryDate: string } | null, huntDate: string): LicenceState {
  if (!newest) return 'missing'
  if (newest.expiryDate <= huntDate) return 'expired'
  return newest.checked ? 'valid' : 'unchecked'
}

export function certificateState(newest: { checked: boolean } | null): CertificateState {
  if (!newest) return 'missing'
  return newest.checked ? 'valid' : 'unchecked'
}
