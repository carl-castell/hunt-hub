import type {
  CertificateState, InvitationResponse, InvitationStatus, LicenceState,
} from '@hunt-hub/backend/src/shared/invitationStates'

/**
 * Display text for the invitation and document codes, in one place for the
 * later translation. Colours: green = fine, amber = needs attention, red = a
 * problem, grey = neutral.
 */

type Tone = 'green' | 'amber' | 'red' | 'grey'
export type Label = { text: string; tone: Tone }

export const RESPONSE_LABELS: Record<InvitationResponse, Label> = {
  yes: { text: 'Coming', tone: 'green' },
  no: { text: 'Not coming', tone: 'red' },
  open: { text: 'No answer', tone: 'grey' },
}

export const STATUS_LABELS: Record<InvitationStatus, string> = {
  staged: 'Not sent',
  sent_email: 'Sent by email',
  sent_manually: 'Invited in person',
  waitlist: 'Waiting list',
  archived: 'Archived',
}

export const LICENCE_LABELS: Record<LicenceState, Label> = {
  valid: { text: 'Licence checked', tone: 'green' },
  unchecked: { text: 'Licence to check', tone: 'amber' },
  expired: { text: 'Licence expires before the hunt', tone: 'red' },
  missing: { text: 'No licence', tone: 'grey' },
}

export const CERTIFICATE_LABELS: Record<CertificateState, Label> = {
  valid: { text: 'Certificate checked', tone: 'green' },
  unchecked: { text: 'Certificate to check', tone: 'amber' },
  missing: { text: 'No certificate', tone: 'grey' },
}

export const TONE_CLASSES: Record<Tone, string> = {
  green: 'bg-green-600/10 text-green-800 dark:text-green-300',
  amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  red: 'bg-red-600/10 text-red-800 dark:text-red-300',
  grey: 'bg-muted text-muted-foreground',
}

/** "Sent 12 Nov · opened", "Not sent", "Invited in person" … */
export function invitationText(i: { status: InvitationStatus; emailSentAt: string | null; openedAt: string | null }, locale?: string): string {
  if (i.status === 'sent_email' && i.emailSentAt) {
    const sent = `Sent ${new Date(i.emailSentAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`
    return i.openedAt ? `${sent} · opened` : sent
  }
  return STATUS_LABELS[i.status]
}

/** The text a new invitation email starts with; the manager can change it. */
export function defaultInvitationMessage(event: { name: string; date: string; start: string }, kind: 'invitation' | 'reminder', locale?: string): string {
  const date = new Date(`${event.date}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  return kind === 'reminder'
    ? `Hello {{firstName}},\n\nwe haven't heard from you yet about "${event.name}" on ${date}. Please let us know whether you're coming.`
    : `Hello {{firstName}},\n\nwe'd be glad to welcome you to "${event.name}" on ${date}, starting at ${event.start}. Please let us know whether you're coming.`
}
