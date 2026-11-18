import { describe, it, expect } from 'vitest'
import { spanText, validityText } from './validity'

describe('validity', () => {
  it('says how long a licence is still valid, or since when it expired', () => {
    expect(validityText('2027-02-20', '2025-11-18')).toBe('Valid for 1 year, 3 months')
    expect(validityText('2026-11-01', '2026-11-18')).toBe('Expired 17 days ago')
    expect(validityText('2026-11-18', '2026-11-18')).toBe('Expires today')
  })

  it('uses days below a month', () => {
    expect(spanText('2026-11-18', '2026-11-19')).toBe('1 day')
    expect(spanText('2026-11-18', '2026-12-08')).toBe('20 days')
  })
})
