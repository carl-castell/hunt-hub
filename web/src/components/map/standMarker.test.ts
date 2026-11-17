import { describe, it, expect } from 'vitest'
import { standMarkerStyle } from './standMarker'

describe('standMarkerStyle', () => {
  it('zoomed in: a circle with the number', () => {
    expect(standMarkerStyle(17)).toEqual({ size: 26, fontSize: 10 })
    expect(standMarkerStyle(14.5)).toEqual({ size: 26, fontSize: 10 })
    expect(standMarkerStyle(14)).toEqual({ size: 20, fontSize: 8 })
  })

  it('zoomed out: only a dot, smaller the further out', () => {
    expect(standMarkerStyle(13)).toEqual({ size: 10, fontSize: null })
    expect(standMarkerStyle(12)).toEqual({ size: 6, fontSize: null })
  })
})
