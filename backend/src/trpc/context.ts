import type { Request, Response } from 'express'

export function createContext({ req, res }: { req: Request; res: Response }) {
  return {
    req,
    session: req.session,
    user: req.session.user ?? null,
    ip: req.ip ?? '',
    res,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
