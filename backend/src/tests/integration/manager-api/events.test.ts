import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'

vi.mock('@/services/mail', () => ({
  renderTemplate: vi.fn(async (_template: string, data: { message: string; rsvpUrl: string }) => `<p>${data.message}</p><a href="${data.rsvpUrl}">Respond</a>`),
  sendMail: vi.fn(async ({ to }: { to: string }) => { if (to.startsWith('broken')) throw new Error('mailbox full') }),
}))

import app from '@/app'
import { db } from '@/db'
import {
  contactsTable, guestGroupMembersTable, guestGroupsTable, huntingLicensesTable, invitationsTable, usersTable,
} from '@/db/schema'
import { todayInGermany } from '@/services/stands'
import { cleanupMobileTestData, createEstate, createUserWithAccount, PASSWORD, TRPC } from '../../helpers/mobile'

const EMAILS = ['ev-manager@test.com']
const ESTATES = ['Events API Estate', 'Events API Other Estate']

let agent: ReturnType<typeof request.agent>
let estateId: number
let otherEstateId: number

const query = (procedure: string, input?: unknown) =>
  agent.get(`${TRPC}/manager.${procedure}`).query(input === undefined ? {} : { input: JSON.stringify(input) })
const mutate = (procedure: string, input: unknown) => agent.post(`${TRPC}/manager.${procedure}`).send(input as object)
const data = (res: request.Response) => res.body.result.data

async function guest(firstName: string, email: string, estate = estateId) {
  const [user] = await db.insert(usersTable).values({ firstName, lastName: 'Guest', role: 'guest', estateId: estate }).returning()
  await db.insert(contactsTable).values({ userId: user.id, email })
  return user.id
}

beforeAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
  estateId = (await createEstate('Events API Estate')).id
  otherEstateId = (await createEstate('Events API Other Estate')).id
  await createUserWithAccount({ email: 'ev-manager@test.com', role: 'manager', estateId })
  agent = request.agent(app)
  await agent.post(`${TRPC}/auth.login`).send({ email: 'ev-manager@test.com', password: PASSWORD })
})

afterAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
})

describe('events and drives', () => {
  let eventId: number

  it('a new event gets "Drive 1" at 09:00 for 2 hours the first time', async () => {
    expect(data(await query('events.defaultStart'))).toBe('09:00')
    eventId = data(await mutate('events.create', { name: 'Drückjagd', date: '2099-12-05' })).id
    const event = data(await query('events.get', { id: eventId }))
    expect(event).toMatchObject({ name: 'Drückjagd', date: '2099-12-05', start: '09:00', drives: 1 })
    expect(event.driveList).toEqual([{ id: expect.any(Number), name: 'Drive 1', start: '09:00', end: '11:00', durationMinutes: 120 }])
    expect(event.nextDriveStart).toBe('12:00')
  })

  it('a new drive is "Drive 2"; times are checked', async () => {
    const created = data(await mutate('drives.create', { eventId, start: '12:00', durationMinutes: 150 }))
    expect(created.name).toBe('Drive 2')
    const event = data(await query('events.get', { id: eventId }))
    expect(event.driveList[1]).toMatchObject({ name: 'Drive 2', start: '12:00', end: '14:30', durationMinutes: 150 })
    expect(event.nextDriveStart).toBe('15:00')

    const late = await mutate('drives.create', { eventId, start: '23:00', durationMinutes: 120 })
    expect(late.status).toBe(400)
    expect(late.body.error.message).toMatch(/before midnight/)
  })

  it("the event's start follows its first drive", async () => {
    const event = data(await query('events.get', { id: eventId }))
    await mutate('drives.update', { id: event.driveList[0].id, start: '08:30', durationMinutes: 90 })
    const after = data(await query('events.get', { id: eventId }))
    expect(after.start).toBe('08:30')
    expect(after.driveList[0]).toMatchObject({ start: '08:30', end: '10:00', durationMinutes: 90 })
  })

  it('the next event starts like the first drive of the last one', async () => {
    expect(data(await query('events.defaultStart'))).toBe('08:30')
    const next = data(await mutate('events.create', { name: 'Ansitz', date: '2099-12-12' })).id
    expect(data(await query('events.get', { id: next })).driveList[0]).toMatchObject({ start: '08:30', durationMinutes: 90 })
  })

  it('an event keeps at least one drive', async () => {
    const event = data(await query('events.get', { id: eventId }))
    expect((await mutate('drives.delete', { id: event.driveList[1].id })).status).toBe(200)
    const last = await mutate('drives.delete', { id: event.driveList[0].id })
    expect(last.status).toBe(400)
    expect(last.body.error.message).toBe('An event needs at least one drive.')
  })

  it("lists today's events as upcoming", async () => {
    const today = data(await mutate('events.create', { name: 'Heute', date: todayInGermany() })).id
    await mutate('events.create', { name: 'Damals', date: '2020-01-10' })
    const { upcoming, past } = data(await query('events.list'))
    expect(upcoming.map((e: { id: number }) => e.id)).toContain(today)
    expect(past.map((e: { name: string }) => e.name)).toEqual(['Damals'])
  })

  it("can't see or change another estate's events", async () => {
    const [{ id: foreign }] = (await db.execute<{ id: number }>(
      // An event of the other estate, created directly.
      (await import('drizzle-orm')).sql`INSERT INTO events (estate_id, event_name, date, time) VALUES (${otherEstateId}, 'Fremd', '2099-01-01', '09:00') RETURNING id`,
    )).rows
    expect((await query('events.get', { id: foreign })).status).toBe(404)
    expect((await mutate('events.delete', { id: foreign })).status).toBe(404)
    expect((await mutate('drives.create', { eventId: foreign, start: '10:00', durationMinutes: 60 })).status).toBe(404)
  })
})

describe('invitations', () => {
  let eventId: number
  let anna: number
  let ben: number
  let broken: number
  let groupId: number

  beforeAll(async () => {
    eventId = data(await mutate('events.create', { name: 'Gesellschaftsjagd', date: '2099-11-21' })).id
    anna = await guest('Anna', 'anna@test.com')
    ben = await guest('Ben', 'ben@test.com')
    broken = await guest('Carla <b>', 'broken@test.com')
    await guest('Fremd', 'fremd@test.com', otherEstateId)
    const [group] = await db.insert(guestGroupsTable).values({ name: 'Treiber', estateId }).returning()
    groupId = group.id
    await db.insert(guestGroupMembersTable).values([{ groupId, userId: ben }, { groupId, userId: broken }])
    await db.insert(huntingLicensesTable).values([
      { estateId, userId: anna, checked: true, expiryDate: '2100-03-31' },
      { estateId, userId: ben, checked: false, expiryDate: '2100-03-31' },
    ])
  })

  it('finds guests and groups not invited yet (only this estate)', async () => {
    const found = data(await query('invitations.searchGuests', { eventId }))
    expect(found.guests.map((g: { firstName: string }) => g.firstName).sort()).toEqual(['Anna', 'Ben', 'Carla <b>'])
    expect(found.groups).toEqual([{ id: groupId, name: 'Treiber', members: 2, available: 2 }])
  })

  it('adds a single guest and a whole group', async () => {
    expect(data(await mutate('invitations.add', { eventId, guestIds: [anna] })).added).toBe(1)
    expect(data(await mutate('invitations.add', { eventId, groupIds: [groupId] })).added).toBe(2)
    expect(data(await mutate('invitations.add', { eventId, groupIds: [groupId] })).added).toBe(0)
  })

  it('lists invitations with groups and licence states', async () => {
    const list = data(await query('invitations.list', { eventId }))
    const byName = Object.fromEntries(list.map((r: { guest: { firstName: string } }) => [r.guest.firstName, r]))
    expect(byName.Anna).toMatchObject({ status: 'staged', response: 'open', licence: 'valid', certificate: 'missing', groups: [] })
    expect(byName.Ben).toMatchObject({ licence: 'unchecked', groups: ['Treiber'] })
    expect(byName['Carla <b>']).toMatchObject({ licence: 'missing' })
    const event = data(await query('events.get', { id: eventId }))
    expect(event.guests).toEqual({ invited: 3, yes: 0, no: 0, open: 0, notSent: 3 })
  })

  it('previews the email with escaped text', async () => {
    const preview = data(await query('invitations.preview', { eventId, kind: 'invitation', message: 'Hallo {{firstName}} <script>' }))
    expect(preview.subject).toBe('Invitation – Gesellschaftsjagd')
    expect(preview.html).toContain('Hallo Max &lt;script&gt;')
  })

  it('sends invitations and reports each guest; a failed one stays unsent', async () => {
    const ids = data(await query('invitations.list', { eventId })).map((r: { id: number }) => r.id)
    const result = data(await mutate('invitations.send', { eventId, kind: 'invitation', message: 'Hallo {{firstName}}', invitationIds: ids, respondBy: '2099-11-14' }))
    expect(result.sent.map((s: { name: string }) => s.name).sort()).toEqual(['Anna Guest', 'Ben Guest'])
    expect(result.failed).toEqual([{ id: expect.any(Number), name: 'Carla <b> Guest', reason: 'The email could not be sent' }])

    const { sendMail } = await import('@/services/mail')
    const carlaMail = vi.mocked(sendMail).mock.calls.find(([m]) => m.to === 'broken@test.com')![0]
    expect(carlaMail.html).toContain('Hallo Carla &lt;b&gt;')

    const event = data(await query('events.get', { id: eventId }))
    expect(event.guests).toMatchObject({ invited: 3, open: 2, notSent: 1 })
    expect(event.sentLinks).toBe(2)
  })

  it('reminds only guests with a sent link and no answer', async () => {
    const list = data(await query('invitations.list', { eventId }))
    const annaRow = list.find((r: { guest: { id: number } }) => r.guest.id === anna)
    await mutate('invitations.update', { eventId, ids: [annaRow.id], response: 'yes' })
    const ids = list.map((r: { id: number }) => r.id)
    const result = data(await mutate('invitations.send', { eventId, kind: 'reminder', message: 'Bitte antworten', invitationIds: ids }))
    expect(result.sent.map((s: { name: string }) => s.name)).toEqual(['Ben Guest'])
    expect(result.skipped).toBe(2)
    const [annaNow] = await db.select().from(invitationsTable).where(eq(invitationsTable.id, annaRow.id))
    expect(annaNow.respondedAt).not.toBeNull()
  })

  it("shows a guest's documents and checks the licence (older ones are deleted)", async () => {
    const list = data(await query('invitations.list', { eventId }))
    const benRow = list.find((r: { guest: { id: number } }) => r.guest.id === ben)
    const details = data(await query('invitations.get', { eventId, invitationId: benRow.id }))
    expect(details.documents).toMatchObject({ licenceState: 'unchecked', certificateState: 'missing', certificate: null })
    expect(details.documents.licence).toMatchObject({ checked: false, expiryDate: '2100-03-31', files: [] })

    // An older licence of Ben's that goes when the newer one is checked.
    await db.insert(huntingLicensesTable).values({ estateId, userId: ben, checked: false, expiryDate: '2099-01-01', uploadDate: new Date('2020-01-01') })
    const res = await mutate('invitations.checkDocument', { eventId, invitationId: benRow.id, kind: 'licence', documentId: details.documents.licence.id })
    expect(res.status).toBe(200)
    const after = data(await query('invitations.get', { eventId, invitationId: benRow.id }))
    expect(after.documents.licenceState).toBe('valid')
    expect(await db.select().from(huntingLicensesTable).where(eq(huntingLicensesTable.userId, ben))).toHaveLength(1)

    // A document of another guest can't be checked through this invitation.
    const annaLicence = (await db.select().from(huntingLicensesTable).where(eq(huntingLicensesTable.userId, anna)))[0]
    expect((await mutate('invitations.checkDocument', { eventId, invitationId: benRow.id, kind: 'licence', documentId: annaLicence.id })).status).toBe(404)
  })

  it('takes guests off the waiting list back to where they were', async () => {
    const list = data(await query('invitations.list', { eventId }))
    const ids = list.map((r: { id: number }) => r.id)
    const before = Object.fromEntries(list.map((r: { id: number; status: string }) => [r.id, r.status]))
    await mutate('invitations.update', { eventId, ids, status: 'waitlist' })
    expect(data(await query('invitations.list', { eventId })).every((r: { status: string }) => r.status === 'waitlist')).toBe(true)

    await mutate('invitations.update', { eventId, ids, restore: true })
    const after = data(await query('invitations.list', { eventId }))
    // Sent ones are "sent by email" again; Carla's email failed, so she is "not sent".
    for (const r of after) expect(r.status).toBe(before[r.id])
  })

  it('removing reports how many links were already sent', async () => {
    const ids = data(await query('invitations.list', { eventId })).map((r: { id: number }) => r.id)
    expect(data(await mutate('invitations.remove', { eventId, ids }))).toEqual({ removed: 3, sentLinks: 2 })
  })
})
