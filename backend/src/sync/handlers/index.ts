import type { SyncHandler } from '../types'

// Registry of mutation types the mobile app may push.
// Empty for now: the app is read-only. To add an edit feature, create a handler
// file here (e.g. stands.ts exporting 'stand.move') and register it below.
const handlers = new Map<string, SyncHandler<any>>()

export function registerSyncHandler<P>(type: string, handler: SyncHandler<P>) {
  handlers.set(type, handler)
}

export function unregisterSyncHandler(type: string) {
  handlers.delete(type)
}

export function getSyncHandler(type: string) {
  return handlers.get(type)
}
