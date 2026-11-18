import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'crypto'
import { sql } from 'drizzle-orm'
import app from '@/app'
import { db } from '@/db'
import { areasTable, contactsTable, huntingLicensesTable, invitationsTable, standsTable, usersTable } from '@/db/schema'
import { todayInGermany } from '@/services/stands'
import { cleanupMobileTestData, createEstate, createUserWithAccount, PASSWORD, TRPC } from '../../helpers/mobile'

const EMAILS = ['dash-manager@test.com']
const ESTATES = ['Dashboard Estate', 'Dashboard Other Estate']

let agent: ReturnType<typeof request.agent>
let estateId: number
let huntId: number
let areaId: number

const plusDays = (n: number) => {
  const d = new Date(`${todayInGermany()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dashboard = async () => (await agent.get(`${TRPC}/manager.dashboard.get`)).body.result.data

async function guest(name: string, invitation: { status: 'staged' | 'sent_email'; response: 'open' | 'yes' | 'no'; respondBy?: string }, licence?: { checked: boolean; expiryDate: string }) {
  const [u] = await db.insert(usersTable).values({ firstName: name, lastName: 'Gast', role: 'guest', estateId }).returning()
  await db.insert(contactsTable).values({ userId: u.id, email: `${name}@test.com` })
  await db.insert(invitationsTable).values({
    publicId: randomUUID(), eventId: huntId, userId: u.id, status: invitation.status, response: invitation.response,
    respondedAt: invitation.response === 'open' ? null : new Date(),
    emailSentAt: invitation.status === 'sent_email' ? new Date() : null,
    respondBy: invitation.respondBy ? new Date(`${invitation.respondBy}T00:00:00Z`) : null,
  })
  if (licence) await db.insert(huntingLicensesTable).values({ estateId, userId: u.id, ...licence })
}

beforeAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
  estateId = (await createEstate('Dashboard Estate')).id
  await createUserWithAccount({ email: 'dash-manager@test.com', role: 'manager', estateId })
  agent = request.agent(app)
  await agent.post(`${TRPC}/auth.login`).send({ email: 'dash-manager@test.com', password: PASSWORD })
})

afterAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
})

describe('the dashboard', () => {
  it('is calm when there is nothing to do', async () => {
    const d = await dashboard()
    expect(d).toMatchObject({ nextHunt: null, upcoming: [], todos: [], areas: [], counts: { guests: 0, groups: 0 } })
  })

  it("today's hunt is the next one; a hunt soon without guests is a to-do", async () => {
    huntId = (await db.execute<{ id: number }>(sql`
      INSERT INTO events (estate_id, event_name, date, time) VALUES (${estateId}, 'Drückjagd', ${todayInGermany()}, '09:00') RETURNING id`)).rows[0].id
    await db.execute(sql`INSERT INTO events (estate_id, event_name, date, time) VALUES (${estateId}, 'Damals', '2020-01-01', '09:00')`)
    const d = await dashboard()
    expect(d.nextHunt).toMatchObject({ id: huntId, name: 'Drückjagd', daysLeft: 0 })
    expect(d.pastCount).toBe(1)
    expect(d.todos).toEqual([{ code: 'no_guests', eventId: huntId, eventName: 'Drückjagd', date: todayInGermany(), daysLeft: 0 }])
  })

  it('lists what needs doing for the hunt, most important first', async () => {
    await guest('Anna', { status: 'sent_email', response: 'yes' }, { checked: false, expiryDate: '2100-01-01' })
    await guest('Ben', { status: 'sent_email', response: 'yes' }, { checked: true, expiryDate: '2100-01-01' })
    await guest('Carla', { status: 'sent_email', response: 'open', respondBy: plusDays(3) })
    await guest('Dora', { status: 'staged', response: 'open' })

    const d = await dashboard()
    expect(d.todos.map((t: { code: string }) => t.code)).toEqual(['coming_without_licence', 'documents_to_check', 'answer_deadline', 'not_sent'])
    expect(d.todos[0]).toMatchObject({ count: 1, names: ['Anna Gast'] })
    expect(d.todos[1]).toMatchObject({ count: 1 })
    expect(d.todos[2]).toMatchObject({ count: 1, respondBy: plusDays(3), daysLeft: 3 })
    expect(d.todos[3]).toMatchObject({ count: 1 })
    expect(d.nextHunt).toMatchObject({ toCheck: 1, toRemind: 1, guests: { invited: 4, yes: 2, open: 1, notSent: 1 } })
    expect(d.counts.guests).toBe(4)
  })

  it('reports broken stands and areas without a boundary', async () => {
    areaId = (await db.insert(areasTable).values({ estateId, name: 'Bog' }).returning())[0].id
    await db.insert(standsTable).values([
      { areaId, number: '1', status: 'broken', statusDate: '2026-11-01' },
      { areaId, number: '2', status: 'needs_repair', statusDate: '2026-11-01' },
      { areaId, number: '3' },
    ])
    const d = await dashboard()
    expect(d.areas).toEqual([{ id: areaId, name: 'Bog', hasBoundary: false, stands: 3, broken: 1, needsRepair: 1, unchecked: 1 }])
    expect(d.todos.slice(-2)).toEqual([
      { code: 'stands_damaged', areaId, areaName: 'Bog', broken: 1, needsRepair: 1 },
      { code: 'area_without_boundary', areaId, areaName: 'Bog' },
    ])
  })

  it("shows nothing of another estate", async () => {
    const other = (await createEstate('Dashboard Other Estate')).id
    await db.insert(areasTable).values({ estateId: other, name: 'Fremd' })
    const d = await dashboard()
    expect(d.areas.map((a: { name: string }) => a.name)).toEqual(['Bog'])
  })

  it('needs a manager', async () => {
    expect((await request(app).get(`${TRPC}/manager.dashboard.get`)).status).toBe(401)
  })
})
