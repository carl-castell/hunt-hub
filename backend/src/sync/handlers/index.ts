import type { SyncHandler } from '../types'
import { createStand, moveStand, renameStand } from './stands'

// Registry of mutation types the mobile app may push. To add an edit feature,
// create a handler file here and register it below.
// Handlers with different payload types share one map; `unknown` instead of
// `any` would reject registering a SyncHandler<P> (its apply() takes a P).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers = new Map<string, SyncHandler<any>>([
  ['stand.create', createStand],
  ['stand.rename', renameStand],
  ['stand.move', moveStand],
])

export function registerSyncHandler<P>(type: string, handler: SyncHandler<P>) {
  handlers.set(type, handler)
}

export function unregisterSyncHandler(type: string) {
  handlers.delete(type)
}

export function getSyncHandler(type: string) {
  return handlers.get(type)
}
