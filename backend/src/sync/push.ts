import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { syncMutationsTable } from '@/db/schema/sync'
import { logError } from '@/utils/logError'
import { getSyncHandler } from './handlers'
import type { MutationResult, SyncUser } from './types'

export type PushedMutation = { id: string; type: string; payload: unknown; createdAt: string }

/** Temporary failure (e.g. DB down): not recorded, so the client retries later. */
export type PushOutcome = MutationResult | { status: 'error' }

const PG_UNIQUE_VIOLATION = '23505'

async function storedResult(id: string, userId: number): Promise<MutationResult | null> {
  const [row] = await db.select().from(syncMutationsTable)
    .where(and(eq(syncMutationsTable.id, id), eq(syncMutationsTable.userId, userId)))
    .limit(1)
  return row ? (row.result as MutationResult) : null
}

async function applyOne(m: PushedMutation, user: SyncUser): Promise<PushOutcome> {
  const previous = await storedResult(m.id, user.id)
  if (previous) return previous

  const handler = getSyncHandler(m.type)
  const parsed = handler?.payload.safeParse(m.payload)

  try {
    return await db.transaction(async (tx) => {
      let result: MutationResult
      if (!handler) result = { status: 'rejected', reason: 'unknown_type' }
      else if (!parsed!.success) result = { status: 'rejected', reason: 'invalid_payload' }
      else result = await handler.apply(tx, parsed!.data, user)

      // Recorded in the same transaction as the change, so a mutation is applied at most once.
      await tx.insert(syncMutationsTable).values({
        id: m.id, userId: user.id, type: m.type, status: result.status, result,
      })
      return result
    })
  } catch (err: any) {
    // The same mutation arrived twice at the same time: return what the other request stored.
    if (err?.code === PG_UNIQUE_VIOLATION || err?.cause?.code === PG_UNIQUE_VIOLATION) {
      const stored = await storedResult(m.id, user.id)
      if (stored) return stored
      // Id taken by another user's mutation: never apply it under this id.
      return { status: 'rejected', reason: 'duplicate_id' }
    }
    logError('[sync push]', err)
    return { status: 'error' }
  }
}

/** Applies mutations in order. Each one is its own transaction. */
export async function pushMutations(mutations: PushedMutation[], user: SyncUser) {
  const results: Array<{ id: string } & PushOutcome> = []
  for (const m of mutations) {
    results.push({ id: m.id, ...(await applyOne(m, user)) })
  }
  return results
}
