import { getNetworkStateAsync } from 'expo-network'
import { useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { addSample, secondsLeft, type RateSample } from './eta'
import { offlineSource, tileUrl, type OfflineSource } from './sources'
import { getOfflineMap, getTileDb, listOfflineMaps, markForUpdate, missingTiles, refreshProgress, saveTile, setStatus } from './store'
import { sampleTiles, type Tile } from './tiles'

/**
 * Downloads offline maps. One instance for the whole app, not tied to a
 * screen: closing the download page doesn't stop it. Progress is stored after
 * every batch, so a download continues after the app was closed.
 *
 * iOS suspends an app shortly after it leaves the foreground, so the download
 * waits while the app is in the background or the phone is offline, and
 * carries on by itself afterwards.
 */

const PARALLEL = 4
const BATCH = 8
const TRIES = 3
const SAMPLE_TILES = 8
const WAIT_MS = 3000
/** Tiles per second on a normal connection, for a rough time before a download has started. */
export const TYPICAL_TILES_PER_SECOND = 6

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A tile's image; throws if the server didn't send one. */
async function fetchTile(source: OfflineSource, tile: Tile): Promise<Uint8Array> {
  const res = await fetch(tileUrl(source, tile))
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.startsWith('image/')) throw new Error(`Tile ${tile.z}/${tile.x}/${tile.y}: ${res.status} ${type}`)
  return new Uint8Array(await res.arrayBuffer())
}

async function fetchTileWithRetry(source: OfflineSource, tile: Tile): Promise<Uint8Array> {
  let last: unknown
  for (let attempt = 0; attempt < TRIES; attempt++) {
    try {
      return await fetchTile(source, tile)
    } catch (err) {
      last = err
      await sleep(500 * 2 ** attempt)
    }
  }
  throw last
}

/** Fetches and stores tiles, a few at a time. Returns how many failed. */
async function downloadTiles(source: OfflineSource, tiles: Tile[]): Promise<number> {
  let failed = 0
  const queue = [...tiles]
  const worker = async () => {
    for (let tile = queue.shift(); tile; tile = queue.shift()) {
      try {
        saveTile(tile, await fetchTileWithRetry(source, tile))
      } catch {
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  return failed
}

async function isOnline(): Promise<boolean> {
  const state = await getNetworkStateAsync()
  return Boolean(state.isConnected) && state.isInternetReachable !== false
}

class OfflineDownloads {
  private running = false
  private samples: Record<string, RateSample[]> = {}
  private eta: Record<string, number | null> = {}
  private listeners = new Set<() => void>()

  /**
   * Downloads a few sample tiles (they are kept) and estimates the size of
   * the whole map from them.
   */
  async estimate(mapId: string) {
    const map = getOfflineMap(mapId)
    const source = map && offlineSource(map.sourceId)
    if (!map || !source) return
    try {
      const all = getTileDb().getAllSync<Tile>('SELECT z, x, y FROM map_tiles WHERE map_id = ?', mapId)
      const sample = sampleTiles(all, SAMPLE_TILES)
      let bytes = 0
      let count = 0
      await Promise.all(sample.map(async (tile) => {
        const data = await fetchTileWithRetry(source, tile)
        saveTile(tile, data)
        bytes += data.length
        count++
      }))
      refreshProgress(mapId)
      setStatus(mapId, 'estimated', { estimatedBytes: Math.round((bytes / Math.max(count, 1)) * map.tilesTotal) })
    } catch {
      setStatus(mapId, 'failed', { error: (await isOnline()) ? 'The map server did not answer. Please try again later.' : 'No internet connection.' })
    }
  }

  start(mapId: string) {
    setStatus(mapId, 'downloading')
    void this.run()
  }

  /** Downloads a finished map again (newer aerial photos). The stored tiles are replaced one by one. */
  update(mapId: string) {
    markForUpdate(mapId)
    this.start(mapId)
  }

  pause(mapId: string) {
    setStatus(mapId, 'paused')
    this.setEta(mapId, null)
  }

  /** Continues downloads that were running when the app was closed. Call once at app start. */
  resume() {
    // An estimate that was cut off by closing the app starts again.
    for (const map of listOfflineMaps()) if (map.status === 'estimating') void this.estimate(map.id)
    void this.run()
  }

  /** Seconds left for a map, or null if unknown. */
  etaOf(mapId: string): number | null {
    return this.eta[mapId] ?? null
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private setEta(mapId: string, seconds: number | null) {
    if (seconds === null) delete this.samples[mapId]
    this.eta[mapId] = seconds
    this.listeners.forEach((listener) => listener())
  }

  private async run() {
    if (this.running) return
    this.running = true
    try {
      // One map at a time, oldest first; the status is read again every round,
      // so pausing, deleting or starting another map takes effect at once.
      for (;;) {
        const map = listOfflineMaps().find((m) => m.status === 'downloading')
        if (!map) break
        const source = offlineSource(map.sourceId)
        if (!source) {
          setStatus(map.id, 'failed', { error: 'This map source is no longer available.' })
          continue
        }
        if (AppState.currentState !== 'active' || !(await isOnline())) {
          this.setEta(map.id, null)
          await sleep(WAIT_MS)
          continue
        }

        const tiles = missingTiles(map.id, BATCH)
        if (tiles.length === 0) {
          refreshProgress(map.id)
          setStatus(map.id, 'complete')
          this.setEta(map.id, 0)
          continue
        }
        const failed = await downloadTiles(source, tiles)
        if (!getOfflineMap(map.id)) continue // deleted meanwhile
        const { done } = refreshProgress(map.id)
        this.samples[map.id] = addSample(this.samples[map.id] ?? [], { at: Date.now(), done })
        this.setEta(map.id, secondsLeft(this.samples[map.id], map.tilesTotal - done))

        // Every tile of the batch failed although the phone is online: the server has a problem. Stop instead of hammering it.
        if (failed === tiles.length && (await isOnline()) && AppState.currentState === 'active') {
          setStatus(map.id, 'failed', { error: 'The map server did not answer. Please try again later.' })
        }
      }
    } finally {
      this.running = false
    }
  }
}

export const offlineDownloads = new OfflineDownloads()

/** The estimated seconds left for a map's download; re-renders when it changes. */
export function useSecondsLeft(mapId: string): number | null {
  return useSyncExternalStore(offlineDownloads.subscribe, () => offlineDownloads.etaOf(mapId))
}
