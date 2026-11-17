/**
 * Coordinate systems of uploaded geo files. Hunt Hub stores everything in
 * WGS 84 (EPSG:4326, longitude/latitude). A file's coordinate system is kept
 * as the text the file itself uses to describe it, e.g. "EPSG:25832", an OGC
 * URN or the WKT of a shapefile's .prj; PostGIS (PROJ) understands all of
 * them and converts with ST_Transform. null = the file doesn't say.
 */

export const WGS84 = 'EPSG:4326'

/** Whether a description means WGS 84 longitude/latitude, so nothing needs converting. */
export function isWgs84(crs: string): boolean {
  const text = crs.trim()
  return /^EPSG:{1,2}4326$/i.test(text)
    || /EPSG:{1,2}4326$/i.test(text) && /^urn:/i.test(text)
    || /CRS:?84$/i.test(text)
}

/**
 * An EPSG code typed by the user ("25832", "EPSG:25832", "epsg 25832") as
 * "EPSG:25832"; null if it isn't one.
 */
export function epsgFromInput(input: string | null | undefined): string | null {
  const match = input?.trim().match(/^(?:EPSG\s*:?\s*)?(\d{4,6})$/i)
  return match ? `EPSG:${match[1]}` : null
}
