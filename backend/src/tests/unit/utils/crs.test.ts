import { describe, it, expect } from 'vitest'
import { epsgFromInput, isWgs84 } from '@/utils/crs'

describe('isWgs84', () => {
  it('recognises WGS 84 longitude/latitude in the usual spellings', () => {
    expect(isWgs84('EPSG:4326')).toBe(true)
    expect(isWgs84('urn:ogc:def:crs:EPSG::4326')).toBe(true)
    expect(isWgs84('urn:ogc:def:crs:OGC:1.3:CRS84')).toBe(true)
  })

  it('does not take other systems for WGS 84', () => {
    expect(isWgs84('EPSG:25832')).toBe(false)
    expect(isWgs84('EPSG:43260')).toBe(false)
    expect(isWgs84('PROJCS["ETRS_1989_UTM_Zone_32N"]')).toBe(false)
  })
})

describe('epsgFromInput', () => {
  it('accepts a code with or without "EPSG"', () => {
    expect(epsgFromInput('25832')).toBe('EPSG:25832')
    expect(epsgFromInput(' epsg:31468 ')).toBe('EPSG:31468')
    expect(epsgFromInput('EPSG 4326')).toBe('EPSG:4326')
  })

  it('returns null for anything else', () => {
    expect(epsgFromInput('UTM 32')).toBeNull()
    expect(epsgFromInput('')).toBeNull()
    expect(epsgFromInput(undefined)).toBeNull()
  })
})
