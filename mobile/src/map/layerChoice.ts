import type { BBox } from './bbox'
import { bboxContains } from './bbox'
import { DEFAULT_BASEMAP_ID, onlineBasemap } from './sources'

type ImportedMap = { id: string; bounds: BBox | null }

/** The state survey's aerial photo: online where a source covers the area, and from the phone where an offline map was downloaded. */
export const AERIAL_BASEMAP_ID = 'aerial'

export type AerialState = {
  /** The area lies in a state whose aerial photos the app can show. */
  available: boolean
  /** An offline map of this area is (at least partly) stored on the phone. */
  stored: boolean
}

const NO_AERIAL: AerialState = { available: false, stored: false }

/**
 * The base map to show on an area's map.
 * - The one chosen for this area before, if it still exists. It is never
 *   changed silently: without a connection the map screen asks whether to
 *   switch to a stored offline map (see `shouldOfferOfflineMap`).
 * - Otherwise, offline: the stored offline map, or an imported map that
 *   covers the area, so the map isn't empty.
 * - Otherwise satellite.
 */
export function resolveBasemapId(
  saved: string | null, online: boolean, imported: ImportedMap[], areaBox: BBox | null, aerial: AerialState = NO_AERIAL,
): string {
  const aerialUsable = aerial.available || aerial.stored
  if (saved === AERIAL_BASEMAP_ID && aerialUsable) return saved
  if (saved && imported.some((m) => m.id === saved)) return saved
  if (saved && onlineBasemap(saved)) return saved

  if (!online) {
    if (aerial.stored) return AERIAL_BASEMAP_ID
    const covering = imported.find((m) => !areaBox || !m.bounds || bboxContains(m.bounds, areaBox))
    if (covering) return covering.id
  }
  return DEFAULT_BASEMAP_ID
}

/**
 * Whether to ask the user to switch to the offline map: the phone has been
 * without a connection for a while, the map shown needs the internet, and an
 * offline map of this area is stored.
 */
export function shouldOfferOfflineMap(shownId: string, offlineForLong: boolean, aerial: AerialState): boolean {
  return offlineForLong && aerial.stored && onlineBasemap(shownId) !== undefined
}
