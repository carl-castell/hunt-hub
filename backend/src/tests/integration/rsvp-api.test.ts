import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'crypto'
import { eq, sql } from 'drizzle-orm'

vi.mock('@/services/storage', () => ({ uploadFile: vi.fn().mockResolvedValue(undefined), deleteFile: vi.fn() }))

import app from '@/app'
import { db } from '@/db'
import { contactsTable, huntingLicensesTable, invitationsTable, trainingCertificatesTable, usersTable } from '@/db/schema'
import { closedReason } from '@/services/rsvp'
import { cleanupMobileTestData, createEstate, createUserWithAccount, PASSWORD, TRPC } from '../helpers/mobile'

const ESTATES = ['RSVP API Estate']
const EMAILS = ['rsvp-manager@test.com']
const PDF = Buffer.from('%PDF-1.4 test')

let estateId: number
let eventId: number
let guestId: number

const call = (procedure: string, input: unknown) => request(app).post(`${TRPC}/rsvp.${procedure}`).send(input as object)
const data = (res: request.Response) => res.body.result.data

async function invitation(status: 'staged' | 'sent_email' | 'archived' = 'sent_email', respondBy: string | null = null, event = eventId) {
  const publicId = randomUUID()
  const [user] = await db.insert(usersTable).values({ firstName: 'Gast', lastName: 'Test', role: 'guest', estateId }).returning()
  await db.insert(contactsTable).values({ userId: user.id, email: `${publicId}@test.com` })
  await db.insert(invitationsTable).values({ publicId, eventId: event, userId: user.id, status, response: 'open', respondBy: respondBy ? new Date(respondBy) : null })
  return { publicId, userId: user.id }
}

const uploadLicence = (publicId: string, expiryDate: string, file = PDF, name = 'licence.pdf', type = 'application/pdf') =>
  request(app).post(`${TRPC}/rsvp.uploadLicence`).field('publicId', publicId).field('expiryDate', expiryDate)
    .attach('files', file, { filename: name, contentType: type })

beforeAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
  estateId = (await createEstate('RSVP API Estate')).id
  await createUserWithAccount({ email: 'rsvp-manager@test.com', role: 'manager', estateId })
  eventId = (await db.execute<{ id: number }>(sql`
    INSERT INTO events (estate_id, event_name, date, time) VALUES (${estateId}, 'Drückjagd', '2099-12-05', '09:00') RETURNING id`)).rows[0].id
  await db.execute(sql`INSERT INTO drives (event_id, name, start_time, end_time) VALUES (${eventId}, 'Drive 1', '09:00', '11:30')`)
  guestId = 0
})

afterAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
})

describe('the answer page', () => {
  let publicId: string

  beforeAll(async () => { ({ publicId, userId: guestId } = await invitation()) })

  it('shows the hunt, the drives and the guest, and records the first visit', async () => {
    const view = data(await call('open', { publicId }))
    expect(view).toMatchObject({
      guest: { firstName: 'Gast' },
      event: { name: 'Drückjagd', date: '2099-12-05', start: '09:00', estate: 'RSVP API Estate' },
      response: 'open',
      closed: null,
      licence: { state: 'missing' },
      certificate: { state: 'missing' },
    })
    expect(view.event.drives).toEqual([{ name: 'Drive 1', start: '09:00', end: '11:30', durationMinutes: 150 }])
    const [row] = await db.select().from(invitationsTable).where(eq(invitationsTable.publicId, publicId))
    expect(row.openedAt).not.toBeNull()
  })

  it('refuses unknown and malformed links', async () => {
    expect((await call('open', { publicId: randomUUID() })).status).toBe(404)
    expect((await call('open', { publicId: 'not-a-link' })).status).toBe(400)
  })

  it('takes the answer, and it can be changed', async () => {
    expect((await call('respond', { publicId, answer: 'no' })).status).toBe(200)
    expect(data(await call('open', { publicId })).response).toBe('no')
    expect((await call('respond', { publicId, answer: 'yes' })).status).toBe(200)
    const [row] = await db.select().from(invitationsTable).where(eq(invitationsTable.publicId, publicId))
    expect(row).toMatchObject({ response: 'yes' })
    expect(row.respondedAt).not.toBeNull()
  })

  it('stores a licence (to be checked), refuses a past expiry date and wrong file types', async () => {
    expect((await uploadLicence(publicId, '2100-03-31')).status).toBe(200)
    const licences = await db.select().from(huntingLicensesTable).where(eq(huntingLicensesTable.userId, guestId))
    expect(licences).toHaveLength(1)
    expect(licences[0]).toMatchObject({ checked: false, expiryDate: '2100-03-31' })
    expect(data(await call('open', { publicId })).licence).toEqual({ state: 'unchecked', expiryDate: '2100-03-31', rejectedBecause: null })

    const past = await uploadLicence(publicId, '2020-01-01')
    expect(past.status).toBe(400)
    expect(past.body.error.message).toMatch(/expired/)
    const wrong = await uploadLicence(publicId, '2100-03-31', Buffer.from('x'), 'notes.txt', 'text/plain')
    expect(wrong.status).toBe(400)
    expect(wrong.body.error.message).toMatch(/one PDF or photos/)
  })

  it('stores a certificate and refuses a future issue date', async () => {
    const ok = await request(app).post(`${TRPC}/rsvp.uploadCertificate`).field('publicId', publicId).field('issueDate', '2026-03-01')
      .attach('files', Buffer.from('jpg'), { filename: 'cert.jpg', contentType: 'image/jpeg' })
    expect(ok.status).toBe(200)
    expect(await db.select().from(trainingCertificatesTable).where(eq(trainingCertificatesTable.userId, guestId))).toHaveLength(1)
    const future = await request(app).post(`${TRPC}/rsvp.uploadCertificate`).field('publicId', publicId).field('issueDate', '2099-01-01')
      .attach('files', Buffer.from('jpg'), { filename: 'cert.jpg', contentType: 'image/jpeg' })
    expect(future.status).toBe(400)
  })

  it('saves phone and date of birth', async () => {
    expect((await call('saveDetails', { publicId, phone: '+49 170 1234567', dateOfBirth: '1980-05-17' })).status).toBe(200)
    expect(data(await call('open', { publicId })).contact).toEqual({ phone: '+49 170 1234567', dateOfBirth: '1980-05-17' })
  })
})

describe('when answering is not possible', () => {
  it('only a guest who is coming can upload documents', async () => {
    const { publicId } = await invitation()
    const res = await uploadLicence(publicId, '2100-03-31')
    expect(res.status).toBe(403)
  })

  it('refuses invitations never sent, archived ones and passed answer-by dates', async () => {
    for (const [status, respondBy, message] of [
      ['staged', null, /not been sent/],
      ['archived', null, /no longer open/],
      ['sent_email', '2020-01-01', /date to answer has passed/],
    ] as const) {
      const { publicId } = await invitation(status, respondBy)
      expect(data(await call('open', { publicId })).closed).not.toBeNull()
      const res = await call('respond', { publicId, answer: 'yes' })
      expect(res.status).toBe(403)
      expect(res.body.error.message).toMatch(message)
    }
  })

  it('knows why it is closed', () => {
    const now = new Date('2026-11-18T12:00:00Z')
    expect(closedReason({ status: 'sent_email', respond_by: null, date: '2026-11-17' }, now)).toBe('past')
    expect(closedReason({ status: 'sent_email', respond_by: '2026-11-18T00:00:00Z', date: '2026-12-01' }, now)).toBeNull()
    expect(closedReason({ status: 'sent_manually', respond_by: null, date: '2026-12-01' }, now)).toBeNull()
  })
})

describe('old links and the preview', () => {
  it('sends old email links to the React page', async () => {
    const res = await request(app).get('/rsvp/2b1c5e0a-1111-4222-8333-444455556666')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/app/rsvp/2b1c5e0a-1111-4222-8333-444455556666')
  })

  it('shows the manager the page with an example guest', async () => {
    const agent = request.agent(app)
    await agent.post(`${TRPC}/auth.login`).send({ email: 'rsvp-manager@test.com', password: PASSWORD })
    const res = await agent.get(`${TRPC}/rsvp.preview`).query({ input: JSON.stringify({ eventId }) })
    expect(data(res)).toMatchObject({ guest: { firstName: 'Max' }, event: { name: 'Drückjagd' }, closed: null })
    expect((await request(app).get(`${TRPC}/rsvp.preview`).query({ input: JSON.stringify({ eventId }) })).status).toBe(401)
  })
})
