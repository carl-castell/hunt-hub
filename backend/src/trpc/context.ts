import type { Request, Response } from 'express'

function readBearerToken(req: Request): string | null {
  const header = req.headers?.authorization
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}

export function createContext({ req, res }: { req: Request; res: Response }) {
  return {
    req,
    session: req.session,
    user: req.session.user ?? null,
    // Mobile app token; only resolved by `fieldProcedure`, never by cookie-based procedures.
    bearerToken: readBearerToken(req),
    ip: req.ip ?? '',
    res,
  }
}

type CreatedContext = ReturnType<typeof createContext>
export type Context = Omit<CreatedContext, 'bearerToken'> & { bearerToken?: string | null }
