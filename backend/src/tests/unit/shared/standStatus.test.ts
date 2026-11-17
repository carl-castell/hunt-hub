import { describe, it, expect } from 'vitest'
import { isStandStatus, resolveStatusDate } from '@/shared/standStatus'
import { standDetailsSchema } from '@/schemas'
import { todayInGermany } from '@/services/stands'

const TODAY = '2026-11-17'

describe('resolveStatusDate', () => {
  it('sets today when the status changes and no date is given', () => {
    expect(resolveStatusDate(null, null, 'broken', undefined, TODAY)).toBe(TODAY)
    expect(resolveStatusDate('ok', '2026-01-02', 'broken', undefined, TODAY)).toBe(TODAY)
  })

  it('keeps the old date when the status stays the same', () => {
    expect(resolveStatusDate('ok', '2026-01-02', 'ok', undefined, TODAY)).toBe('2026-01-02')
  })

  it('uses a given date', () => {
    expect(resolveStatusDate('ok', '2026-01-02', 'broken', '2026-11-01', TODAY)).toBe('2026-11-01')
    expect(resolveStatusDate('ok', '2026-01-02', 'ok', '2026-03-04', TODAY)).toBe('2026-03-04')
  })

  it('clears the date when the status is cleared, even if a date is given', () => {
    expect(resolveStatusDate('ok', '2026-01-02', null, '2026-11-01', TODAY)).toBeNull()
  })
})

describe('isStandStatus', () => {
  it('accepts the four codes only', () => {
    expect(['ok', 'needs_repair', 'broken', 'removed'].every(isStandStatus)).toBe(true)
    expect(isStandStatus('OK')).toBe(false)
    expect(isStandStatus('')).toBe(false)
    expect(isStandStatus(null)).toBe(false)
  })
})

describe('standDetailsSchema', () => {
  it('trims the nickname and turns an empty one into null', () => {
    expect(standDetailsSchema.parse({ nickname: '  Eiche ' }).nickname).toBe('Eiche')
    expect(standDetailsSchema.parse({ nickname: '   ' }).nickname).toBeNull()
  })

  it('leaves missing fields undefined, so they stay unchanged', () => {
    expect(standDetailsSchema.parse({})).toEqual({})
  })

  it('refuses unknown statuses, long nicknames and impossible dates', () => {
    expect(standDetailsSchema.safeParse({ status: 'fine' }).success).toBe(false)
    expect(standDetailsSchema.safeParse({ nickname: 'x'.repeat(65) }).success).toBe(false)
    expect(standDetailsSchema.safeParse({ statusDate: '2026-02-31' }).success).toBe(false)
    expect(standDetailsSchema.safeParse({ statusDate: '17.11.2026' }).success).toBe(false)
  })
})

describe('todayInGermany', () => {
  it('uses the German date, not UTC', () => {
    // 23:30 UTC on 17 Nov is already 18 Nov in Germany (UTC+1).
    expect(todayInGermany(new Date('2026-11-17T23:30:00Z'))).toBe('2026-11-18')
  })
})
