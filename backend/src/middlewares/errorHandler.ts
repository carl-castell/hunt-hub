import type { NextFunction, Request, Response } from 'express';
import { logger } from '@/utils/logger';

/**
 * One answer format for errors that no route handled itself:
 * JSON for the API (`{ error: { code, message, requestId } }`), a short page
 * for browsers. tRPC formats its own errors; this covers everything else.
 */

/** Stable codes, so clients can react to (and later translate) an error without parsing text. */
const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'TOO_MANY_REQUESTS',
}

const MESSAGES: Record<string, string> = {
  BAD_REQUEST: 'The request could not be understood.',
  UNAUTHORIZED: 'Please log in.',
  FORBIDDEN: 'You are not allowed to do this.',
  NOT_FOUND: 'This page or resource does not exist.',
  PAYLOAD_TOO_LARGE: 'The request is too large.',
  UNSUPPORTED_MEDIA_TYPE: 'This content type is not supported.',
  TOO_MANY_REQUESTS: 'Too many requests. Please try again later.',
  INTERNAL_SERVER_ERROR: 'Something went wrong on our side. Please try again later.',
}

type HttpError = Error & { status?: number; statusCode?: number; expose?: boolean }

/** The HTTP status of an error: its own 4xx/5xx status (e.g. from the body parser), otherwise 500. */
export function statusOf(err: unknown): number {
  const e = err as HttpError
  const status = e?.status ?? e?.statusCode
  return typeof status === 'number' && status >= 400 && status < 600 ? status : 500
}

export function codeOf(status: number): string {
  return CODES[status] ?? (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST')
}

function wantsJson(req: Request): boolean {
  return req.path.startsWith('/api/') || req.accepts(['html', 'json']) === 'json'
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function send(req: Request, res: Response, status: number, message: string) {
  const code = codeOf(status)
  const requestId = res.getHeader('X-Request-Id')?.toString()
  res.status(status)
  if (wantsJson(req)) {
    res.json({ error: { code, message, requestId } })
    return
  }
  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${status} – Hunt Hub</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#1d1f1a}small{color:#6b6f63}a{color:#d9480f}</style>
</head><body><h1>${status}</h1><p>${escapeHtml(message)}</p><p><a href="/">Back to the start page</a></p>
${requestId ? `<p><small>Request ID: ${escapeHtml(requestId)}</small></p>` : ''}</body></html>`)
}

/** Unknown paths: a 404 in the same format as every other error. */
export function notFound(req: Request, res: Response) {
  send(req, res, 404, MESSAGES.NOT_FOUND)
}

/**
 * Last middleware: logs the error with the request id and answers without
 * internal details. Client errors (4xx) keep their message only if it is
 * meant for the client (`expose`, set e.g. by the body parser).
 */
// Express recognises an error handler by its four parameters.
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err)

  const status = statusOf(err)
  const log = (req as Request & { log?: typeof logger }).log ?? logger
  if (status >= 500) log.error({ err }, 'unhandled error')
  else log.warn({ err: { message: (err as Error)?.message } }, 'request rejected')

  const e = err as HttpError
  const message = status < 500 && e?.expose && e.message ? e.message : MESSAGES[codeOf(status)]
  send(req, res, status, message)
}
