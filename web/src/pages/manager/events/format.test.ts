import { describe, it, expect } from 'vitest'
import { durationsFor, formatEventDate, startTimesFrom, todayIso } from './format'
import { endOf, formatDuration, nextDriveName, nextFullHourAfter } from '@hunt-hub/backend/src/shared/driveTimes'

describe('drive times', () => {
  it('suggests the next full hour after the previous drive', () => {
    expect(nextFullHourAfter('11:00')).toBe('12:00')
    expect(nextFullHourAfter('11:30')).toBe('12:00')
    expect(nextFullHourAfter('23:30')).toBe('23:00')
  })

  it('names new drives Drive 2, Drive 3, …, also after a renamed or deleted one', () => {
    expect(nextDriveName(['Drive 1'])).toBe('Drive 2')
    expect(nextDriveName(['Drive 1', 'Drive 3'])).toBe('Drive 4')
    expect(nextDriveName(['Morgens'])).toBe('Drive 2')
  })

  it('shows the length in hours and the end', () => {
    expect(formatDuration(150, 'en-GB')).toBe('2.5 h')
    expect(formatDuration(120, 'en-GB')).toBe('2 h')
    expect(formatDuration(45, 'en-GB')).toBe('45 min')
    expect(endOf('09:00', 150)).toBe('11:30')
  })

  it('opens the start list at the suggested time', () => {
    const list = startTimesFrom('12:00')
    expect(list[0]).toBe('12:00')
    expect(list[1]).toBe('12:15')
    expect(list).toHaveLength(96)
    expect(list).toContain('08:00')
  })

  it('offers only durations that end before midnight, keeping the current one', () => {
    expect(durationsFor('22:00')).toEqual([30, 60, 90, 120])
    expect(durationsFor('09:00', 135)).toContain(135)
  })
})

describe('dates', () => {
  it('formats the event date for the reader', () => {
    expect(formatEventDate('2026-12-05', 'en-GB')).toBe('Sat, 5 Dec 2026')
  })

  it("gives today's local date", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
