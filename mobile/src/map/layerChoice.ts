import type { BBox } from './bbox'
import { bboxContains } from './bbox'
import { DEFAULT_BASEMAP_ID, onlineBasemap } from './sources'

type ImportedMap = { id: string; bounds: BBox | null }

/**
 * The base map to show on an area's map.
 * - The one chosen for this area before, if it still exists.
 * - Otherwise, offline: an imported map that covers the area, so the map isn't empty.
 * - Otherwise satellite.
 */
export function resolveBasemapId(saved: string | null, online: boolean, imported: ImportedMap[], areaBox: BBox | null): string {
  if (saved && (onlineBasemap(saved) || imported.some((m) => m.id === saved))) return saved
  if (!online) {
    const covering = imported.find((m) => !areaBox || !m.bounds || bboxContains(m.bounds, areaBox))
    if (covering) return covering.id
  }
  return DEFAULT_BASEMAP_ID
}
