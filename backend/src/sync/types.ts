import type { z } from 'zod'
import type { db } from '@/db'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type MutationResult =
  | { status: 'applied'; data?: unknown }
  | { status: 'rejected'; reason: string }
  | { status: 'conflict'; reason: string; server?: unknown }

export type SyncUser = SessionUser & { estateId: number }

/** A kind of change the mobile app can push, e.g. 'stand.move'. */
export type SyncHandler<P = unknown> = {
  payload: z.ZodType<P>
  apply: (tx: Tx, payload: P, user: SyncUser) => Promise<MutationResult>
}
