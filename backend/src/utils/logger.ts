import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import pino from 'pino';
import { pinoHttp } from 'pino-http';

/**
 * Structured JSON logging: one JSON object per line, so a log service (or
 * `grep` / `jq`) can filter by request id, user, status or duration.
 *
 * - LOG_LEVEL sets the level (default info; silent in tests)
 * - LOG_PRETTY=true prints readable lines instead of JSON (set for `npm run dev`)
 */
const isTest = process.env.NODE_ENV === 'test';

/** Field paths that must never appear in a log line, wherever they occur. */
const REDACTED_PATHS = [
  'password', '*.password', '*.newPassword', '*.currentPassword',
  'token', '*.token', '*.accessToken', '*.refreshToken', '*.secret',
  'headers.cookie', 'headers.authorization', '*.headers.cookie', '*.headers.authorization',
];

/** The app's logger configuration; `destination` lets tests capture the output. */
export function createLogger(destination?: pino.DestinationStream, level?: pino.LevelWithSilent) {
  const pretty = process.env.LOG_PRETTY === 'true' && !destination;
  return pino({
    level: level ?? process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
    base: { service: 'hunt-hub-backend', commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    ...(pretty && { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } }),
  }, destination);
}

export const logger = createLogger();

/** Path segments right after these prefixes are secrets (activation token, RSVP magic link). */
const SECRET_PATH_PREFIXES = ['/activate/', '/rsvp/', '/app/rsvp/'];
/** Query parameters that carry secrets (e.g. the QGIS/WFS access token). */
const SECRET_QUERY_PARAMS = ['token', 'access_token', 'key'];

/** The URL with secrets replaced, safe to write into logs. */
export function sanitizeUrl(rawUrl: string): string {
  const [path, query] = rawUrl.split('?', 2);

  let safePath = path;
  for (const prefix of SECRET_PATH_PREFIXES) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (rest.startsWith('preview/')) continue; // the manager's RSVP preview has no secret
    const [, ...after] = rest.split('/');
    safePath = [`${prefix}[redacted]`, ...after].join('/');
  }

  if (!query) return safePath;
  const params = new URLSearchParams(query);
  for (const name of [...params.keys()]) {
    if (SECRET_QUERY_PARAMS.includes(name.toLowerCase())) params.set(name, '[redacted]');
  }
  return `${safePath}?${params.toString()}`;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/** Reuses an incoming X-Request-Id (e.g. from a proxy) if it looks safe, otherwise creates one. */
export function requestIdFor(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

type RequestWithSession = IncomingMessage & { session?: { user?: { id: number; role: string } } };

/**
 * One log line per request: method, safe URL, status, duration, request id
 * and, if logged in, user id and role. Health checks are not logged.
 */
export function createRequestLogger(log: pino.Logger) {
  return pinoHttp({
  logger: log,
  genReqId: requestIdFor,
  // pino-http's default also calls a request "aborted" when its (empty) body
  // was never read, which is true for every static file. What matters is
  // whether the response reached the client completely.
  customSuccessMessage: (_req, res) => (res.writableFinished ? 'request completed' : 'request aborted'),
  autoLogging: { ignore: (req) => req.url === '/health' },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  customProps: (req) => {
    const user = (req as RequestWithSession).session?.user;
    return user ? { userId: user.id, role: user.role } : {};
  },
  serializers: {
    // Only what is needed to trace a request; no headers, no body.
    req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: sanitizeUrl(req.url) }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  });
}

export const requestLogger = createRequestLogger(logger);
