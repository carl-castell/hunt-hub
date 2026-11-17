import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { isoDateSchema } from '@/schemas'
import {
  InvitationNotFoundError, MAX_DOCUMENT_BYTES, previewView, respond, RsvpClosedError, rsvpView, saveDetails,
  uploadCertificate, uploadLicence, UploadRejectedError, type UploadedFile,
} from '@/services/rsvp'
import { managerProcedure, publicProcedure, router } from '../trpc'

/**
 * The guest's answer page. Public: the invitation's id from the email link
 * is the key. Rate-limited per call (see middlewares/trpcAuthLimits.ts), and
 * the id is kept out of the logs (utils/logger.ts).
 */

const toTrpc = (err: unknown) => {
  if (err instanceof InvitationNotFoundError) return new TRPCError({ code: 'NOT_FOUND', message: err.message })
  if (err instanceof RsvpClosedError) return new TRPCError({ code: 'FORBIDDEN', message: err.message })
  if (err instanceof UploadRejectedError) return new TRPCError({ code: 'BAD_REQUEST', message: err.message })
  return null
}
const rsvpProcedure = publicProcedure.use(async ({ next }) => {
  const result = await next()
  if (!result.ok) throw toTrpc(result.error.cause) ?? result.error
  return result
})

const publicId = z.string().uuid('This invitation link is not valid.')

/** A FormData upload: the link's id, a date field and the files. */
const upload = (dateField: 'expiryDate' | 'issueDate') => z
  .instanceof(FormData)
  .transform((form) => ({
    publicId: form.get('publicId'),
    date: form.get(dateField),
    files: form.getAll('files').filter((f): f is File => f instanceof File),
  }))
  .pipe(z.object({
    publicId,
    date: isoDateSchema,
    files: z.array(z.instanceof(File)).max(4, 'At most 4 files.')
      .refine((files) => files.every((f) => f.size <= MAX_DOCUMENT_BYTES), 'Each file can be at most 10 MB.'),
  }))

const toUploaded = async (files: File[]): Promise<UploadedFile[]> =>
  Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, size: f.size, bytes: Buffer.from(await f.arrayBuffer()) })))

export const rsvpRouter = router({
  /** The page's content. A mutation, not a query: it records the first visit, and the id stays out of the URL. */
  open: rsvpProcedure.input(z.object({ publicId })).mutation(({ input }) => rsvpView(input.publicId)),

  respond: rsvpProcedure
    .input(z.object({ publicId, answer: z.enum(['yes', 'no']) }))
    .mutation(({ input }) => respond(input.publicId, input.answer)),

  uploadLicence: rsvpProcedure.input(upload('expiryDate')).mutation(async ({ input }) =>
    uploadLicence(input.publicId, { expiryDate: input.date, files: await toUploaded(input.files) })),

  uploadCertificate: rsvpProcedure.input(upload('issueDate')).mutation(async ({ input }) =>
    uploadCertificate(input.publicId, { issueDate: input.date, files: await toUploaded(input.files) })),

  saveDetails: rsvpProcedure
    .input(z.object({
      publicId,
      phone: z.string().trim().max(40).nullable().optional(),
      dateOfBirth: isoDateSchema.nullable().optional(),
    }))
    .mutation(({ input }) => saveDetails(input.publicId, input)),

  /** For the manager: the page as an example guest sees it. Nothing is saved. */
  preview: managerProcedure.use(async ({ next }) => {
    const result = await next()
    if (!result.ok) throw toTrpc(result.error.cause) ?? result.error
    return result
  }).input(z.object({ eventId: z.number().int().positive() })).query(({ ctx, input }) => previewView(ctx.estateId, input.eventId)),
})
