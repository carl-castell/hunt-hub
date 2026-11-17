import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { areaNameSchema } from '@/schemas'
import { epsgFromInput } from '@/utils/crs'
import {
  AreaNotFoundError, DeleteConfirmationError, GeofileRejectedError,
  listAreas, getAreaWithBoundary, listStands, createArea, renameArea, deleteArea,
  setAreaBoundaryFromFile, clearAreaBoundary,
} from '@/services/areas'
import { router, managerProcedure } from '../../trpc'

/** Same limit as the upload form of the server-rendered pages. */
export const MAX_BOUNDARY_FILE_BYTES = 20_000_000

const areaIdInput = z.object({ id: z.number().int().positive() })

/** The tRPC error for an error of the areas service, or null if it is none of them. */
function serviceErrorToTRPC(err: unknown): TRPCError | null {
  if (err instanceof AreaNotFoundError) return new TRPCError({ code: 'NOT_FOUND', message: err.message })
  if (err instanceof DeleteConfirmationError) return new TRPCError({ code: 'BAD_REQUEST', message: err.message })
  if (err instanceof GeofileRejectedError) {
    return new TRPCError({ code: err.status < 500 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR', message: err.message })
  }
  return null
}

/**
 * All area procedures map service errors the same way. tRPC wraps thrown
 * errors, so the service error is the `cause`. Other errors (e.g. input
 * validation) pass through unchanged.
 */
const areaProcedure = managerProcedure.use(async ({ next }) => {
  const result = await next()
  if (!result.ok) throw serviceErrorToTRPC(result.error.cause) ?? result.error
  return result
})

/** Multipart upload: `areaId` and `file` fields. Sent with httpLink (FormData can't be batched). */
const boundaryUploadInput = z
  .instanceof(FormData)
  .transform((form) => ({ areaId: Number(form.get('areaId')), file: form.get('file'), crs: typeof form.get('crs') === 'string' ? (form.get('crs') as string) : '' }))
  .pipe(z.object({
    areaId: z.number().int().positive(),
    // Only needed for files that don't say which coordinate system they use.
    crs: z.string().trim()
      .transform((value) => (value ? epsgFromInput(value) ?? value : null))
      .refine((value) => value === null || value.startsWith('EPSG:'), 'Please enter an EPSG code, e.g. 25832'),
    file: z
      .instanceof(File, { message: 'Please choose a file' })
      .refine((file) => file.size > 0, 'The file is empty')
      .refine((file) => file.size <= MAX_BOUNDARY_FILE_BYTES, 'The file is larger than 20 MB'),
  }))

const actorOf = (ctx: { user: { id: number }; ip: string }) => ({ userId: ctx.user.id, ip: ctx.ip })

const parseGeoJson = (geoJson: string | null) => (geoJson ? (JSON.parse(geoJson) as GeoJSON.Geometry) : null)

export const managerAreasRouter = router({
  list: areaProcedure.query(({ ctx }) => listAreas(ctx.estateId)),

  /** One area with its boundary and stands, ready for the map. */
  get: areaProcedure.input(areaIdInput).query(async ({ ctx, input }) => {
    const area = await getAreaWithBoundary(ctx.estateId, input.id)
    const stands = await listStands(ctx.estateId, input.id)
    return {
      id: area.id,
      name: area.name,
      boundary: parseGeoJson(area.boundaryGeoJson),
      stands: stands.map((s) => ({
        id: s.id, number: s.number, location: parseGeoJson(s.locationGeoJson),
        nickname: s.nickname, status: s.status, statusDate: s.statusDate,
      })),
    }
  }),

  create: areaProcedure
    .input(areaNameSchema)
    .mutation(({ ctx, input }) => createArea(ctx.estateId, input.name)),

  rename: areaProcedure
    .input(areaIdInput.merge(areaNameSchema))
    .mutation(({ ctx, input }) => renameArea(ctx.estateId, input.id, input.name)),

  delete: areaProcedure
    .input(areaIdInput.extend({ confirmName: z.string() }))
    .mutation(({ ctx, input }) => deleteArea(ctx.estateId, input.id, input.confirmName, actorOf(ctx))),

  uploadBoundary: areaProcedure
    .input(boundaryUploadInput)
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(await input.file.arrayBuffer())
      await setAreaBoundaryFromFile(ctx.estateId, input.areaId, { buffer, filename: input.file.name, crs: input.crs }, actorOf(ctx))
    }),

  clearBoundary: areaProcedure
    .input(areaIdInput)
    .mutation(({ ctx, input }) => clearAreaBoundary(ctx.estateId, input.id, actorOf(ctx))),
})
