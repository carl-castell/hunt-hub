import { describe, it, expect } from 'vitest'
import { INVITATION_RESPONSES, INVITATION_STATUSES, LICENCE_STATES, CERTIFICATE_STATES } from '@hunt-hub/backend/src/shared/invitationStates'
import { CERTIFICATE_LABELS, LICENCE_LABELS, RESPONSE_LABELS, STATUS_LABELS, defaultInvitationMessage, invitationText } from './labels'

describe('labels', () => {
  it('has words for every code', () => {
    for (const r of INVITATION_RESPONSES) expect(RESPONSE_LABELS[r].text).toBeTruthy()
    for (const s of INVITATION_STATUSES) expect(STATUS_LABELS[s]).toBeTruthy()
    for (const l of LICENCE_STATES) expect(LICENCE_LABELS[l].text).toBeTruthy()
    for (const c of CERTIFICATE_STATES) expect(CERTIFICATE_LABELS[c].text).toBeTruthy()
  })

  it('describes the invitation in words', () => {
    expect(invitationText({ status: 'staged', emailSentAt: null, openedAt: null })).toBe('Not sent')
    expect(invitationText({ status: 'sent_email', emailSentAt: '2026-11-12T10:00:00Z', openedAt: null }, 'en-GB')).toBe('Sent 12 Nov')
    expect(invitationText({ status: 'sent_email', emailSentAt: '2026-11-12T10:00:00Z', openedAt: '2026-11-13T08:00:00Z' }, 'en-GB')).toBe('Sent 12 Nov · opened')
    expect(invitationText({ status: 'sent_manually', emailSentAt: null, openedAt: null })).toBe('Invited in person')
  })

  it('starts the message with the hunt, date and start, and the name placeholder', () => {
    const text = defaultInvitationMessage({ name: 'Drückjagd', date: '2026-12-05', start: '09:00' }, 'invitation', 'en-GB')
    expect(text).toContain('Hello {{firstName}}')
    expect(text).toContain('"Drückjagd" on Saturday 5 December, starting at 09:00')
    expect(defaultInvitationMessage({ name: 'Drückjagd', date: '2026-12-05', start: '09:00' }, 'reminder', 'en-GB')).toContain("haven't heard from you yet")
  })
})
