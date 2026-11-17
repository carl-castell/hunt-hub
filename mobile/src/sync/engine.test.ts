import { createSyncEngine, PUSH_BATCH_SIZE } from './engine'
import type { OutboxItem, PullResult, PushOutcome, SyncApi, SyncStore } from './types'

/** In-memory version of the SQLite store, same rules. */
function memoryStore() {
  const s = {
    cursor: null as string | null,
    areas: new Map<number, PullResult['areas'][number]>(),
    stands: new Map<number, PullResult['stands'][number]>(),
    outbox: [] as Array<OutboxItem & { status: 'pending' | 'rejected' }>,
  }
  const store: SyncStore = {
    async getCursor() { return s.cursor },
    async applyPull(r) {
      if (r.full) { s.areas.clear(); s.stands.clear() }
      r.areas.forEach((a) => s.areas.set(a.id, a))
      r.stands.forEach((st) => s.stands.set(st.id, st))
      for (const d of r.deleted) {
        if (d.entity === 'area') {
          s.areas.delete(d.id)
          for (const [id, st] of s.stands) if (st.areaId === d.id) s.stands.delete(id)
        } else s.stands.delete(d.id)
      }
      s.cursor = r.cursor
    },
    async pendingMutations(limit) { return s.outbox.filter((m) => m.status === 'pending').slice(0, limit) },
    async recordPushResults(results) {
      for (const r of results) {
        const i = s.outbox.findIndex((m) => m.id === r.id)
        if (i < 0) continue
        if (r.status === 'applied') s.outbox.splice(i, 1)
        else if (r.status === 'error') s.outbox[i].attempts++
        else s.outbox[i].status = 'rejected'
      }
    },
  }
  return { s, store }
}

const area = (id: number, name = `Area ${id}`) => ({ id, name, geojson: null, updatedAt: '2026-01-01T00:00:00.000000Z' })
const stand = (id: number, areaId: number) => ({ id, areaId, number: String(id), lng: 10, lat: 50, nickname: null, status: null, statusDate: null, updatedAt: '2026-01-01T00:00:00.000000Z' })
const pullResult = (p: Partial<PullResult>): PullResult => ({ full: false, cursor: 'c1', areas: [], stands: [], deleted: [], ...p })
const mutation = (id: string): OutboxItem & { status: 'pending' } => ({ id, type: 't', payload: {}, createdAt: '2026-01-01T00:00:00Z', attempts: 0, status: 'pending' })

function fakeApi(pulls: PullResult[], pushImpl?: (ids: string[]) => PushOutcome[]) {
  const calls: string[] = []
  const cursors: Array<string | null> = []
  const api: SyncApi = {
    async pull(cursor) { calls.push('pull'); cursors.push(cursor); return pulls.shift() ?? pullResult({}) },
    async push(mutations) {
      calls.push(`push:${mutations.length}`)
      const ids = mutations.map((m) => m.id)
      return pushImpl ? pushImpl(ids) : ids.map((id) => ({ id, status: 'applied' as const }))
    },
  }
  return { api, calls, cursors }
}

describe('sync engine', () => {
  it('stores a full snapshot and then pulls from the returned cursor', async () => {
    const { s, store } = memoryStore()
    const { api, cursors } = fakeApi([
      pullResult({ full: true, cursor: 'c1', areas: [area(1), area(2)], stands: [stand(10, 1)] }),
      pullResult({ cursor: 'c2', areas: [area(2, 'Renamed')] }),
    ])
    const engine = createSyncEngine(api, store)

    await engine.run()
    await engine.run()

    expect(cursors).toEqual([null, 'c1'])
    expect(s.cursor).toBe('c2')
    expect([...s.areas.values()].map((a) => a.name)).toEqual(['Area 1', 'Renamed'])
  })

  it('a full snapshot replaces everything local', async () => {
    const { s, store } = memoryStore()
    s.areas.set(99, area(99))
    const { api } = fakeApi([pullResult({ full: true, areas: [area(1)] })])
    await createSyncEngine(api, store).run()
    expect([...s.areas.keys()]).toEqual([1])
  })

  it('applies deletes; an area tombstone also removes its stands', async () => {
    const { s, store } = memoryStore()
    s.areas.set(1, area(1)); s.areas.set(2, area(2))
    s.stands.set(10, stand(10, 1)); s.stands.set(20, stand(20, 2)); s.stands.set(21, stand(21, 2))
    const { api } = fakeApi([pullResult({ deleted: [{ entity: 'area', id: 1 }, { entity: 'stand', id: 21 }] })])
    await createSyncEngine(api, store).run()
    expect([...s.areas.keys()]).toEqual([2])
    expect([...s.stands.keys()]).toEqual([20])
  })

  it('pushes queued changes before pulling', async () => {
    const { s, store } = memoryStore()
    s.outbox.push(mutation('a'), mutation('b'))
    const { api, calls } = fakeApi([])
    const result = await createSyncEngine(api, store).run()
    expect(calls).toEqual(['push:2', 'pull'])
    expect(result.pushed).toBe(2)
    expect(s.outbox).toEqual([])
  })

  it('does not call push when nothing is queued', async () => {
    const { store } = memoryStore()
    const { api, calls } = fakeApi([])
    await createSyncEngine(api, store).run()
    expect(calls).toEqual(['pull'])
  })

  it('pushes in batches', async () => {
    const { s, store } = memoryStore()
    for (let i = 0; i < PUSH_BATCH_SIZE + 5; i++) s.outbox.push(mutation(`m${i}`))
    const { api, calls } = fakeApi([])
    await createSyncEngine(api, store).run()
    expect(calls).toEqual([`push:${PUSH_BATCH_SIZE}`, 'push:5', 'pull'])
  })

  it('keeps temporarily failed changes for the next run and marks refused ones', async () => {
    const { s, store } = memoryStore()
    s.outbox.push(mutation('ok'), mutation('flaky'), mutation('bad'))
    const { api } = fakeApi([], (ids) => ids.map((id) =>
      id === 'ok' ? { id, status: 'applied' as const }
        : id === 'flaky' ? { id, status: 'error' as const }
        : { id, status: 'rejected' as const, reason: 'unknown_type' }))
    const result = await createSyncEngine(api, store).run()
    expect(result).toMatchObject({ pushed: 1, failed: 1, rejected: 1 })
    expect(s.outbox.map((m) => [m.id, m.status, m.attempts])).toEqual([['flaky', 'pending', 1], ['bad', 'rejected', 0]])
  })

  it('does not loop on a full batch of failing changes', async () => {
    const { s, store } = memoryStore()
    for (let i = 0; i < PUSH_BATCH_SIZE; i++) s.outbox.push(mutation(`m${i}`))
    const { api, calls } = fakeApi([], (ids) => ids.map((id) => ({ id, status: 'error' as const })))
    await createSyncEngine(api, store).run()
    expect(calls).toEqual([`push:${PUSH_BATCH_SIZE}`, 'pull'])
  })

  it('runs only one sync at a time', async () => {
    const { store } = memoryStore()
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    let pulls = 0
    const api: SyncApi = {
      async pull() { pulls++; await gate; return pullResult({}) },
      async push() { return [] },
    }
    const engine = createSyncEngine(api, store)
    const a = engine.run()
    const b = engine.run()
    expect(a).toBe(b)
    expect(engine.isRunning).toBe(true)
    release()
    await a
    expect(pulls).toBe(1)
    expect(engine.isRunning).toBe(false)
  })

  it('keeps local data and cursor when the network fails', async () => {
    const { s, store } = memoryStore()
    s.cursor = 'old'
    s.areas.set(1, area(1))
    s.outbox.push(mutation('a'))
    const api: SyncApi = {
      async pull() { throw new Error('Network request failed') },
      async push() { throw new Error('Network request failed') },
    }
    await expect(createSyncEngine(api, store).run()).rejects.toThrow('Network request failed')
    expect(s.cursor).toBe('old')
    expect(s.areas.size).toBe(1)
    expect(s.outbox).toHaveLength(1)
  })
})
