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
 * unchecked = uploaded, not checked yet; expired = expires before the hunt;
 * rejected = the manager rejected it and the guest hasn't uploaded a new one; missing = none.
 */
export const LICENCE_STATES = ['valid', 'unchecked', 'expired', 'rejected', 'missing'] as const
export type LicenceState = (typeof LICENCE_STATES)[number]

/** A guest's training certificate (Schießnachweis): valid = checked; unchecked; rejected; missing. */
export const CERTIFICATE_STATES = ['valid', 'unchecked', 'rejected', 'missing'] as const
export type CertificateState = (typeof CERTIFICATE_STATES)[number]

/** Whether the invitation link has gone out to the guest (by email or by hand). */
export function linkSent(status: InvitationStatus): boolean {
  return status === 'sent_email' || status === 'sent_manually'
}

/**
 * Whether the guest has received the invitation: their email went out (they
 * may be on the waiting list since) or they were invited in person.
 */
export function invitationWentOut(i: { status: InvitationStatus; emailSentAt: string | null }): boolean {
  return i.emailSentAt !== null || i.status === 'sent_manually'
}

/** Which filter of the guest list an invitation belongs to (archived ones only count there). */
export type GuestFilter = 'yes' | 'no' | 'open' | 'notSent' | 'waitlist' | 'archived'

export function guestFilters(i: { status: InvitationStatus; response: InvitationResponse; emailSentAt: string | null }): GuestFilter[] {
  if (i.status === 'archived') return ['archived']
  const filters: GuestFilter[] = []
  if (i.status === 'waitlist') filters.push('waitlist')
  if (!invitationWentOut(i)) filters.push('notSent')
  else if (i.response === 'open') filters.push('open')
  if (i.response === 'yes') filters.push('yes')
  if (i.response === 'no') filters.push('no')
  return filters
}

type Newest = { checked: boolean; uploadedAt?: string | null } | null
type Rejection = { rejectedAt: string } | null

/** A rejection counts until the guest uploads a newer document. */
function rejectedSince(newest: Newest, rejection: Rejection): boolean {
  if (!rejection) return false
  return !newest || !newest.uploadedAt || new Date(newest.uploadedAt) < new Date(rejection.rejectedAt)
}

export function licenceState(
  newest: (NonNullable<Newest> & { expiryDate: string }) | null, huntDate: string, rejection: Rejection = null,
): LicenceState {
  if (rejectedSince(newest, rejection)) return 'rejected'
  if (!newest) return 'missing'
  if (newest.expiryDate <= huntDate) return 'expired'
  return newest.checked ? 'valid' : 'unchecked'
}

export function certificateState(newest: Newest, rejection: Rejection = null): CertificateState {
  if (rejectedSince(newest, rejection)) return 'rejected'
  if (!newest) return 'missing'
  return newest.checked ? 'valid' : 'unchecked'
}
