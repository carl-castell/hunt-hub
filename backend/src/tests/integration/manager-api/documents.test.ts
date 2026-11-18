import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'crypto'
import { eq, sql } from 'drizzle-orm'

vi.mock('@/services/storage', () => ({ uploadFile: vi.fn().mockResolvedValue(undefined), deleteFile: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/mail', () => ({
  renderTemplate: vi.fn(async (_t: string, data: { message: string; rsvpUrl: string }) => `<p>${data.message}</p><a href="${data.rsvpUrl}">x</a>`),
  sendMail: vi.fn().mockResolvedValue(undefined),
}))

import app from '@/app'
import { db } from '@/db'
import { contactsTable, huntingLicensesTable, invitationsTable, trainingCertificatesTable, usersTable } from '@/db/schema'
import { todayInGermany } from '@/services/stands'
import { cleanupMobileTestData, createEstate, createUserWithAccount, PASSWORD, TRPC } from '../../helpers/mobile'

const EMAILS = ['docs-manager@test.com']
const ESTATES = ['Documents Estate', 'Documents Other Estate']

let agent: ReturnType<typeof request.agent>
let estateId: number
let guestId: number
let eventId: number
let publicId: string

const query = (p: string, input: unknown) => agent.get(`${TRPC}/manager.documents.${p}`).query({ input: JSON.stringify(input) })
const mutate = (p: string, input: unknown) => agent.post(`${TRPC}/manager.documents.${p}`).send(input as object)
const data = (res: request.Response) => res.body.result.data

beforeAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
  estateId = (await createEstate('Documents Estate')).id
  await createUserWithAccount({ email: 'docs-manager@test.com', role: 'manager', estateId })
  const [guest] = await db.insert(usersTable).values({ firstName: 'Anna', lastName: 'Jäger', role: 'guest', estateId }).returning()
  guestId = guest.id
  await db.insert(contactsTable).values({ userId: guestId, email: 'anna@test.com', dateOfBirth: '1980-05-17' })
  eventId = (await db.execute<{ id: number }>(sql`
    INSERT INTO events (estate_id, event_name, date, time) VALUES (${estateId}, 'Drückjagd', '2099-12-05', '09:00') RETURNING id`)).rows[0].id
  publicId = randomUUID()
  await db.insert(invitationsTable).values({ publicId, eventId, userId: guestId, status: 'sent_email', response: 'yes', respondedAt: new Date() })
  agent = request.agent(app)
  await agent.post(`${TRPC}/auth.login`).send({ email: 'docs-manager@test.com', password: PASSWORD })
})

afterAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
})

describe('checking documents', () => {
  let licenceId: number

  it('shows the guest (to compare) and the document, judged for the hunt', async () => {
    licenceId = (await db.insert(huntingLicensesTable).values({ estateId, userId: guestId, checked: false, expiryDate: '2099-12-01' }).returning())[0].id
    const view = data(await query('get', { guestId, eventId }))
    expect(view.guest).toMatchObject({ firstName: 'Anna', lastName: 'Jäger', dateOfBirth: '1980-05-17' })
    expect(view.hunt).toEqual({ date: '2099-12-05', name: 'Drückjagd' })
    // Expires four days before the hunt.
    expect(view.licenceState).toBe('expired')
    expect(data(await query('get', { guestId })).licenceState).toBe('unchecked')
  })

  it('confirms with the date corrected to what the document says', async () => {
    expect((await mutate('confirm', { guestId, kind: 'licence', documentId: licenceId, correctedDate: '2100-03-31' })).status).toBe(200)
    const view = data(await query('get', { guestId, eventId }))
    expect(view.licenceState).toBe('valid')
    expect(view.licence).toMatchObject({ checked: true, expiryDate: '2100-03-31' })
  })

  it('refuses a corrected expiry date in the past', async () => {
    const res = await mutate('confirm', { guestId, kind: 'licence', documentId: licenceId, correctedDate: '2020-01-01' })
    expect(res.status).toBe(400)
  })

  it('rejects with a reason: the document goes, the guest is emailed with their link', async () => {
    const certId = (await db.insert(trainingCertificatesTable).values({ estateId, userId: guestId, checked: false, issueDate: '2026-01-10' }).returning())[0].id
    const res = await mutate('reject', { guestId, kind: 'certificate', documentId: certId, reason: 'The photo is not readable.', eventId })
    expect(data(res)).toEqual({ emailed: true })
    expect(await db.select().from(trainingCertificatesTable).where(eq(trainingCertificatesTable.id, certId))).toEqual([])

    const { sendMail } = await import('@/services/mail')
    const calls = vi.mocked(sendMail).mock.calls
    const mail = calls[calls.length - 1][0]
    expect(mail).toMatchObject({ to: 'anna@test.com', subject: 'Please upload your training certificate again – Drückjagd' })
    expect(mail.html).toContain('The photo is not readable.')
    expect(mail.html).toContain(`/rsvp/${publicId}`)

    const view = data(await query('get', { guestId, eventId }))
    expect(view.certificateState).toBe('rejected')
    expect(view.certificateRejection.reason).toBe('The photo is not readable.')
    const list = data(await agent.get(`${TRPC}/manager.invitations.list`).query({ input: JSON.stringify({ eventId }) }))
    expect(list[0].certificate).toBe('rejected')
    // The guest sees why on the answer page.
    const page = data(await request(app).post(`${TRPC}/rsvp.open`).send({ publicId }))
    expect(page.certificate).toMatchObject({ state: 'rejected', rejectedBecause: 'The photo is not readable.' })
  })

  it("a new upload by the guest ends the rejection", async () => {
    await request(app).post(`${TRPC}/rsvp.uploadCertificate`).field('publicId', publicId).field('issueDate', '2026-02-01')
      .attach('files', Buffer.from('jpg'), { filename: 'cert.jpg', contentType: 'image/jpeg' })
    expect(data(await query('get', { guestId, eventId })).certificateState).toBe('unchecked')
  })

  it('the manager uploads for the guest: checked at once, replaces older ones', async () => {
    const res = await agent.post(`${TRPC}/manager.documents.upload`)
      .field('guestId', String(guestId)).field('kind', 'certificate').field('date', todayInGermany())
      .attach('files', Buffer.from('%PDF-1.4'), { filename: 'paper.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(200)
    const view = data(await query('get', { guestId, eventId }))
    expect(view.certificateState).toBe('valid')
    expect(view.certificate.files).toEqual([{ key: expect.stringContaining('paper.pdf'), name: 'paper.pdf', contentType: 'application/pdf' }])
    expect(await db.select().from(trainingCertificatesTable).where(eq(trainingCertificatesTable.userId, guestId))).toHaveLength(1)
  })

  it('deletes a document', async () => {
    const view = data(await query('get', { guestId }))
    expect((await mutate('delete', { guestId, kind: 'licence', documentId: view.licence.id })).status).toBe(200)
    expect(data(await query('get', { guestId })).licenceState).toBe('missing')
  })

  it("can't touch another estate's guest", async () => {
    const other = (await createEstate('Documents Other Estate')).id
    const [stranger] = await db.insert(usersTable).values({ firstName: 'X', lastName: 'Y', role: 'guest', estateId: other }).returning()
    await db.insert(contactsTable).values({ userId: stranger.id, email: 'x@test.com' })
    const doc = (await db.insert(huntingLicensesTable).values({ estateId: other, userId: stranger.id, expiryDate: '2100-01-01' }).returning())[0]
    expect((await query('get', { guestId: stranger.id })).status).toBe(404)
    expect((await mutate('confirm', { guestId: stranger.id, kind: 'licence', documentId: doc.id })).status).toBe(404)
    expect((await mutate('reject', { guestId: stranger.id, kind: 'licence', documentId: doc.id, reason: 'nope nope' })).status).toBe(404)
  })
})
