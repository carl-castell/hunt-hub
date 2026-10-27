import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@hunt-hub/backend/src/trpc/router'

type Out = inferRouterOutputs<AppRouter>
type In = inferRouterInputs<AppRouter>

export type PullResult = Out['mobile']['sync']['pull']
export type PushInput = In['mobile']['sync']['push']['mutations']
export type PushOutcome = Out['mobile']['sync']['push'][number]

export type OutboxItem = {
  id: string
  type: string
  payload: unknown
  createdAt: string
  attempts: number
}

/** Network side of sync (the tRPC client in the app, a fake in tests). */
export interface SyncApi {
  pull(cursor: string | null): Promise<PullResult>
  push(mutations: PushInput): Promise<PushOutcome[]>
}

/** Local side of sync (SQLite in the app, in-memory in tests). */
export interface SyncStore {
  getCursor(): Promise<string | null>
  /** Applies a pull atomically and stores the new cursor. */
  applyPull(result: PullResult): Promise<void>
  pendingMutations(limit: number): Promise<OutboxItem[]>
  /** Removes applied items, marks rejected/conflict ones, counts attempts on errors. */
  recordPushResults(results: PushOutcome[]): Promise<void>
}
