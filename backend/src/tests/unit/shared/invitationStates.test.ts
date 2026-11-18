import { describe, it, expect } from 'vitest'
import { guestFilters, invitationWentOut } from '@/shared/invitationStates'

const sent = '2026-11-12T10:00:00Z'

describe('guestFilters', () => {
  it('a new guest is "not sent"', () => {
    expect(guestFilters({ status: 'staged', response: 'open', emailSentAt: null })).toEqual(['notSent'])
  })

  it('a guest with a sent link and no answer is "no answer"', () => {
    expect(guestFilters({ status: 'sent_email', response: 'open', emailSentAt: sent })).toEqual(['open'])
    expect(guestFilters({ status: 'sent_manually', response: 'open', emailSentAt: null })).toEqual(['open'])
  })

  it('on the waiting list: also "not sent" if the invitation never went out, otherwise "no answer"', () => {
    expect(guestFilters({ status: 'waitlist', response: 'open', emailSentAt: null })).toEqual(['waitlist', 'notSent'])
    expect(guestFilters({ status: 'waitlist', response: 'open', emailSentAt: sent })).toEqual(['waitlist', 'open'])
  })

  it('answers count as coming / not coming', () => {
    expect(guestFilters({ status: 'sent_email', response: 'yes', emailSentAt: sent })).toEqual(['yes'])
    expect(guestFilters({ status: 'waitlist', response: 'no', emailSentAt: sent })).toEqual(['waitlist', 'no'])
  })

  it('archived guests only count as archived', () => {
    expect(guestFilters({ status: 'archived', response: 'yes', emailSentAt: sent })).toEqual(['archived'])
  })
})

describe('invitationWentOut', () => {
  it('by email or in person', () => {
    expect(invitationWentOut({ status: 'waitlist', emailSentAt: sent })).toBe(true)
    expect(invitationWentOut({ status: 'sent_manually', emailSentAt: null })).toBe(true)
    expect(invitationWentOut({ status: 'staged', emailSentAt: null })).toBe(false)
  })
})
