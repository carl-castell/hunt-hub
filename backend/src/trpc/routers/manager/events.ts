import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  createDrive, createEvent, defaultEventStart, deleteDrive, deleteEvent, DriveNotFoundError, DriveRuleError,
  EventNotFoundError, getEvent, listEvents, updateDrive, updateEvent,
} from '@/services/events'
import {
  guestOfInvitation, invitationDetails, listInvitations, previewEmail, removeInvitations, searchGuests, sendEmails,
  stageInvitations, updateInvitations,
} from '@/services/invitations'
import { checkCertificate, checkLicence, DocumentNotFoundError } from '@/services/guestDocuments'
import { INVITATION_RESPONSES, INVITATION_STATUSES } from '@/shared/invitationStates'
import { isoDateSchema } from '@/schemas'
import { getBaseUrl } from '@/utils/url'
import { router, managerProcedure } from '../../trpc'

/** The services' errors as tRPC errors; the website shows the message. */
const eventProcedure = managerProcedure.use(async ({ next }) => {
  const result = await next()
  if (!result.ok) {
    const cause = result.error.cause
    if (cause instanceof EventNotFoundError || cause instanceof DriveNotFoundError || cause instanceof DocumentNotFoundError) {
      throw new TRPCError({ code: 'NOT_FOUND', message: cause.message })
    }
    if (cause instanceof DriveRuleError) throw new TRPCError({ code: 'BAD_REQUEST', message: cause.message })
    throw result.error
  }
  return result
})

const id = z.number().int().positive()
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM.')
const eventFields = z.object({ name: z.string().trim().min(1, 'Please enter a name.').max(255), date: isoDateSchema })
const ids = z.array(id).max(500)
const actorOf = (ctx: { user: { id: number }; ip: string }) => ({ userId: ctx.user.id, ip: ctx.ip })

export const managerEventsRouter = router({
  list: eventProcedure.query(({ ctx }) => listEvents(ctx.estateId)),

  get: eventProcedure.input(z.object({ id })).query(({ ctx, input }) => getEvent(ctx.estateId, input.id)),

  /** The start time a new event will get (Drive 1 of the last event, or 09:00). */
  defaultStart: eventProcedure.query(({ ctx }) => defaultEventStart(ctx.estateId)),

  create: eventProcedure.input(eventFields).mutation(({ ctx, input }) => createEvent(ctx.estateId, input, actorOf(ctx))),

  update: eventProcedure.input(eventFields.extend({ id })).mutation(({ ctx, input }) =>
    updateEvent(ctx.estateId, input.id, { name: input.name, date: input.date }, actorOf(ctx))),

  delete: eventProcedure.input(z.object({ id })).mutation(({ ctx, input }) => deleteEvent(ctx.estateId, input.id, actorOf(ctx))),
})

const duration = z.number().int().min(15).max(24 * 60)

export const managerDrivesRouter = router({
  create: eventProcedure
    .input(z.object({ eventId: id, name: z.string().trim().max(255).optional(), start: time, durationMinutes: duration }))
    .mutation(({ ctx, input }) => createDrive(ctx.estateId, input.eventId, input)),

  update: eventProcedure
    .input(z.object({ id, name: z.string().trim().max(255).optional(), start: time.optional(), durationMinutes: duration.optional() }))
    .mutation(({ ctx, input }) => updateDrive(ctx.estateId, input.id, input)),

  delete: eventProcedure.input(z.object({ id })).mutation(({ ctx, input }) => deleteDrive(ctx.estateId, input.id)),
})

const emailInput = z.object({
  eventId: id,
  kind: z.enum(['invitation', 'reminder']),
  message: z.string().trim().min(1, 'Please write a message.').max(5000),
})

export const managerInvitationsRouter = router({
  list: eventProcedure.input(z.object({ eventId: id })).query(({ ctx, input }) => listInvitations(ctx.estateId, input.eventId)),

  /** One invitation with the guest's contact details, licence and certificate. */
  get: eventProcedure
    .input(z.object({ eventId: id, invitationId: id }))
    .query(({ ctx, input }) => invitationDetails(ctx.estateId, input.eventId, input.invitationId)),

  /** Marks the guest's licence or certificate as checked (older ones are deleted). */
  checkDocument: eventProcedure
    .input(z.object({ eventId: id, invitationId: id, kind: z.enum(['licence', 'certificate']), documentId: id }))
    .mutation(async ({ ctx, input }) => {
      const guestId = await guestOfInvitation(ctx.estateId, input.eventId, input.invitationId)
      const check = input.kind === 'licence' ? checkLicence : checkCertificate
      await check(ctx.estateId, guestId, input.documentId, actorOf(ctx))
    }),

  /** Guests not invited yet (by name or group name) and the estate's guest groups. */
  searchGuests: eventProcedure
    .input(z.object({ eventId: id, search: z.string().max(100).default(''), offset: z.number().int().min(0).default(0) }))
    .query(({ ctx, input }) => searchGuests(ctx.estateId, input.eventId, input.search, input.offset)),

  /** Adds guests and whole groups to the guest list (not sent yet). */
  add: eventProcedure
    .input(z.object({ eventId: id, guestIds: ids.default([]), groupIds: ids.default([]) }))
    .mutation(({ ctx, input }) => stageInvitations(ctx.estateId, input.eventId, input)),

  update: eventProcedure
    .input(z.object({
      eventId: id, ids,
      status: z.enum(INVITATION_STATUSES).optional(),
      response: z.enum(INVITATION_RESPONSES).optional(),
    }))
    .mutation(({ ctx, input }) => updateInvitations(ctx.estateId, input.eventId, input.ids, input)),

  remove: eventProcedure
    .input(z.object({ eventId: id, ids }))
    .mutation(({ ctx, input }) => removeInvitations(ctx.estateId, input.eventId, input.ids)),

  /** The email as an example guest gets it. A query, so the preview updates while typing. */
  preview: eventProcedure
    .input(emailInput.extend({ message: z.string().max(5000) }))
    .query(({ ctx, input }) => previewEmail(ctx.estateId, input.eventId, input.kind, input.message, getBaseUrl(ctx.req))),

  /** Sends invitations (not sent yet) or reminders (no answer yet); reports each guest's result. */
  send: eventProcedure
    .input(emailInput.extend({ invitationIds: ids.min(1, 'Choose at least one guest.'), respondBy: isoDateSchema.nullable().optional() }))
    .mutation(({ ctx, input }) => sendEmails(ctx.estateId, input.eventId, input, { baseUrl: getBaseUrl(ctx.req), actor: actorOf(ctx) })),
})
