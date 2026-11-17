import { formatStatusDate, isStandStatus, standTitle, statusText, todayIso } from './status'

describe('stand status helpers', () => {
  it('knows the four status codes', () => {
    expect(['ok', 'needs_repair', 'broken', 'removed'].every(isStandStatus)).toBe(true)
    expect(isStandStatus('fine')).toBe(false)
    expect(isStandStatus(null)).toBe(false)
  })

  it('builds the title with the nickname', () => {
    expect(standTitle({ number: '12', nickname: 'Eiche' })).toBe('Stand 12 · Eiche')
    expect(standTitle({ number: '12', nickname: null })).toBe('Stand 12')
  })

  it('describes the status with its date', () => {
    expect(formatStatusDate('2026-11-17', 'en-GB')).toBe('17 Nov 2026')
    expect(statusText('broken', '2026-11-17', 'en-GB')).toBe('Broken · since 17 Nov 2026')
    expect(statusText('ok', null)).toBe('OK')
    expect(statusText(null, '2026-11-17')).toBeNull()
  })

  it("gives the phone's local date", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
