import { TRPCError } from '@trpc/server'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { isoDateSchema } from '@/schemas'
import {
  confirmDocument, deleteDocument, DocumentNotFoundError, DocumentRejectedError, guestDocuments, guestOfEstate,
  MAX_DOCUMENT_BYTES, rejectDocument, uploadForGuest,
} from '@/services/guestDocuments'
import { todayInGermany } from '@/services/stands'
import { getBaseUrl } from '@/utils/url'
import { managerProcedure, router } from '../../trpc'

/** Checking guests' licences and certificates (from an event or the guest's page). */
const documentProcedure = managerProcedure.use(async ({ next }) => {
  const result = await next()
  if (!result.ok) {
    const cause = result.error.cause
    if (cause instanceof DocumentNotFoundError) throw new TRPCError({ code: 'NOT_FOUND', message: cause.message })
    if (cause instanceof DocumentRejectedError) throw new TRPCError({ code: 'BAD_REQUEST', message: cause.message })
    throw result.error
  }
  return result
})

const id = z.number().int().positive()
const kind = z.enum(['licence', 'certificate'])
const actorOf = (ctx: { user: { id: number }; ip: string }) => ({ userId: ctx.user.id, ip: ctx.ip })

/** The hunt's date, if the check happens for a hunt of this estate; otherwise today. */
async function huntDate(estateId: number, eventId?: number) {
  if (!eventId) return { date: todayInGermany(), name: null }
  const res = await db.execute<{ date: string; name: string }>(sql`
    SELECT to_char(date, 'YYYY-MM-DD') AS date, event_name AS name FROM events WHERE id = ${eventId} AND estate_id = ${estateId}`)
  if (!res.rows[0]) throw new DocumentNotFoundError()
  return res.rows[0]
}

export const managerDocumentsRouter = router({
  /** The guest (to compare name and date of birth) and their documents, judged for the hunt's date if given. */
  get: documentProcedure
    .input(z.object({ guestId: id, eventId: id.optional() }))
    .query(async ({ ctx, input }) => {
      const hunt = await huntDate(ctx.estateId, input.eventId)
      const guest = await guestOfEstate(ctx.estateId, input.guestId)
      return { guest, hunt, ...(await guestDocuments(ctx.estateId, input.guestId, hunt.date)) }
    }),

  /** Confirm a document, optionally with the date corrected to what the document says. */
  confirm: documentProcedure
    .input(z.object({ guestId: id, kind, documentId: id, correctedDate: isoDateSchema.optional() }))
    .mutation(({ ctx, input }) => confirmDocument(ctx.estateId, input.guestId, input.kind, input.documentId, input.correctedDate, actorOf(ctx))),

  /** Reject with a reason: the document goes, the guest is emailed (if they have an open invitation). */
  reject: documentProcedure
    .input(z.object({ guestId: id, kind, documentId: id, reason: z.string().trim().min(3, 'Please give a reason.').max(500), eventId: id.optional() }))
    .mutation(({ ctx, input }) => rejectDocument(ctx.estateId, input.guestId, input.kind, input.documentId, input.reason,
      { baseUrl: getBaseUrl(ctx.req), eventId: input.eventId, actor: actorOf(ctx) })),

  delete: documentProcedure
    .input(z.object({ guestId: id, kind, documentId: id }))
    .mutation(({ ctx, input }) => deleteDocument(ctx.estateId, input.guestId, input.kind, input.documentId, actorOf(ctx))),

  /** The manager uploads a document for the guest; it counts as checked. FormData: guestId, kind, date, files. */
  upload: documentProcedure
    .input(z.instanceof(FormData)
      .transform((form) => ({
        guestId: Number(form.get('guestId')),
        kind: form.get('kind'),
        date: form.get('date'),
        files: form.getAll('files').filter((f): f is File => f instanceof File),
      }))
      .pipe(z.object({
        guestId: id,
        kind,
        date: isoDateSchema,
        files: z.array(z.instanceof(File)).min(1, 'Please choose a file.').max(4, 'At most 4 files.')
          .refine((files) => files.every((f) => f.size <= MAX_DOCUMENT_BYTES), 'Each file can be at most 10 MB.'),
      })))
    .mutation(async ({ ctx, input }) => {
      const files = await Promise.all(input.files.map(async (f) => ({ name: f.name, type: f.type, size: f.size, bytes: Buffer.from(await f.arrayBuffer()) })))
      return uploadForGuest(ctx.estateId, input.guestId, input.kind, input.date, files, actorOf(ctx))
    }),
})
