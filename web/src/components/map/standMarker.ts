import { BOUNDARY_COLOR } from './areaStyle'

/** How a stand marker looks: its circle size and the number's font size (null: just a dot). Same steps as the iPhone app. */
export type StandMarkerStyle = { size: number; fontSize: number | null }

/**
 * Stand markers by zoom level, in steps: zoomed in, a circle with the number;
 * zoomed out, an ever smaller dot, so many stands don't clutter the map.
 * Steps instead of a smooth scale, so markers only change when a step changes.
 */
export function standMarkerStyle(zoom: number): StandMarkerStyle {
  if (zoom >= 14.5) return { size: 26, fontSize: 10 }
  if (zoom >= 13.5) return { size: 20, fontSize: 8 }
  if (zoom >= 12.5) return { size: 10, fontSize: null }
  return { size: 6, fontSize: null }
}

/** Applies a marker style to a stand's element: the same circle for every number, or a dot. */
export function applyStandMarkerStyle(element: HTMLElement, number: string, style: StandMarkerStyle) {
  const dot = style.fontSize === null
  Object.assign(element.style, {
    width: `${style.size}px`,
    height: `${style.size}px`,
    borderRadius: '50%',
    // Keep stands hidden if the legend turned them off.
    display: element.style.display === 'none' ? 'none' : 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    border: dot ? '1px solid #ffffff' : `1.5px solid ${BOUNDARY_COLOR}`,
    background: dot ? BOUNDARY_COLOR : '#ffffff',
    color: BOUNDARY_COLOR,
    fontSize: dot ? '0' : `${style.fontSize}px`,
    fontWeight: '700',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.3px',
    lineHeight: '1',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
    cursor: 'pointer',
  })
  element.textContent = dot ? '' : number
}
