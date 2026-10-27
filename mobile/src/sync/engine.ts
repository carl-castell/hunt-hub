import type { SyncApi, SyncStore } from './types'

export const PUSH_BATCH_SIZE = 50

export type SyncRunResult = {
  pushed: number
  rejected: number
  failed: number
  pulledAreas: number
  pulledStands: number
  deleted: number
  full: boolean
}

/**
 * Push local changes first (so the pull already contains their effects), then pull.
 * Only one run happens at a time: calling `run()` during a sync returns the running one.
 * Network errors propagate to the caller; nothing local is lost when a run fails.
 */
export function createSyncEngine(api: SyncApi, store: SyncStore) {
  let running: Promise<SyncRunResult> | null = null

  async function pushAll(result: SyncRunResult) {
    const seen = new Set<string>()
    for (;;) {
      const batch = (await store.pendingMutations(PUSH_BATCH_SIZE)).filter((m) => !seen.has(m.id))
      if (batch.length === 0) return
      batch.forEach((m) => seen.add(m.id))

      const outcomes = await api.push(batch.map((m) => ({
        id: m.id, type: m.type, payload: m.payload, createdAt: m.createdAt,
      })))
      await store.recordPushResults(outcomes)

      for (const o of outcomes) {
        if (o.status === 'applied') result.pushed++
        else if (o.status === 'error') result.failed++
        else result.rejected++
      }
      // Items that failed temporarily stay pending; `seen` stops us retrying them in this run.
      if (batch.length < PUSH_BATCH_SIZE) return
    }
  }

  async function doRun(): Promise<SyncRunResult> {
    const result: SyncRunResult = { pushed: 0, rejected: 0, failed: 0, pulledAreas: 0, pulledStands: 0, deleted: 0, full: false }
    await pushAll(result)

    const pulled = await api.pull(await store.getCursor())
    await store.applyPull(pulled)
    result.pulledAreas = pulled.areas.length
    result.pulledStands = pulled.stands.length
    result.deleted = pulled.deleted.length
    result.full = pulled.full
    return result
  }

  return {
    run(): Promise<SyncRunResult> {
      if (!running) running = doRun().finally(() => { running = null })
      return running
    },
    get isRunning() { return running !== null },
  }
}

export type SyncEngine = ReturnType<typeof createSyncEngine>
