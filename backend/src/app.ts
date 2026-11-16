import express, { Express } from "express";
import path from "path";
import session from "express-session";
import ejsLayouts from 'express-ejs-layouts';
import helmet from 'helmet';
import connectPg from 'connect-pg-simple';
import pg from 'pg';

import { requestLogger } from "./utils/logger";
import { requireAdmin, requireManager, requireAuth } from './middlewares/requireRole';
import { generalLimiter } from "./middlewares/rateLimiter";
import { generateCsrfToken, verifyCsrfToken } from './middlewares/csrf';
import { serveWebApp } from './middlewares/serveWebApp';
import { letTrpcReadMultipart } from './middlewares/trpcMultipart';
import { limitTrpcAuthAttempts } from './middlewares/trpcAuthLimits';
import { MAX_BOUNDARY_FILE_BYTES } from './trpc/routers/manager/areas';
import { MANAGER_NAV, managerNavHref } from './shared/managerNav';

import homeRouter from "./routes/home";
import { createHealthRouter } from "./routes/health";
import wfsRouter from "./routes/wfs";
import authRouter from "./routes/auth";
import adminRouter from "./routes/admin";
import managerRouter from "./routes/manager";
import usersRouter from './routes/users';
import activateRouter from './routes/activate';
import mapRouter from "./routes/map";
import rsvpRouter from './routes/rsvp';
import totpRouter from './routes/totp';

import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';

import { estatesTable } from './db/schema/estates';
import { db } from './db';
import { eq, sql } from 'drizzle-orm';


const app: Express = express();
app.set('trust proxy', 1);
const PgStore = connectPg(session);

export const sessionPool = new pg.Pool({
  connectionString: process.env.DB_PROVIDER === 'neon'
    ? process.env.NEON_DATABASE_URL
    : process.env.LOCAL_DATABASE_URL,
  ssl: process.env.DB_PROVIDER === 'neon' ? { rejectUnauthorized: false } : false,
});

app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));
app.use(ejsLayouts);
app.set('layout', 'layout');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "https://unpkg.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      "img-src": [
        "'self'", "data:", "blob:",
        "https://*.tile.openstreetmap.org",
        "https://*.opentopomap.org",
        "https://server.arcgisonline.com",
        "https://unpkg.com",
      ],
      "connect-src": [
        "'self'",
        "https://unpkg.com",
        "https://*.tile.openstreetmap.org",
        "https://*.opentopomap.org",
        "https://server.arcgisonline.com",
      ],
      "frame-ancestors": ["'self'"],
      "frame-src": ["'self'"],
      // blob: lets MapLibre (React area map) start its web worker.
      "worker-src": ["'self'", "blob:", "https://unpkg.com"],
      "child-src": ["'self'", "blob:"],
    },
  },
}));

// Before the session middleware: health checks must not create sessions.
app.use(createHealthRouter(() => db.execute(sql`SELECT 1`)));

app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));

app.use(
  session({
    store: new PgStore({
      pool: sessionPool,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 2,
    },
  })
);

// After the session, so each request line can include the user id and role.
app.use(requestLogger);
app.use(generalLimiter);
app.use('/wfs', wfsRouter);
// Same brute-force protection for the tRPC logins (web and mobile) as for the old login form.
app.use('/api/v1/trpc', limitTrpcAuthAttempts);
app.use('/api/v1/trpc', letTrpcReadMultipart, createExpressMiddleware({
  router: appRouter,
  createContext,
  // Allows geo file uploads (20 MB, same as the server-rendered upload form).
  // JSON requests are still limited to 10 kB by express.json above.
  maxBodySize: MAX_BOUNDARY_FILE_BYTES + 1_000_000,
}));
app.use(generateCsrfToken);
app.use(verifyCsrfToken);
app.use(express.static(path.join(process.cwd(), "public"), { maxAge: "7d" }));
serveWebApp(app);

app.use("/", homeRouter);
app.use("/", authRouter);
app.use("/", totpRouter);
app.use('/admin', requireAdmin, (_req, res, next) => {
  res.locals.layout = 'admin/layout';
  next();
});
app.use("/admin", requireAdmin, adminRouter);
app.use('/map', requireAuth, mapRouter);

app.use('/manager', requireManager, async (req, res, next) => {
  res.locals.layout = 'manager/layout';

  const [estate] = await db
    .select()
    .from(estatesTable)
    .where(eq(estatesTable.id, req.session.user!.estateId!))
    .limit(1);

  res.locals.estateName = estate?.name ?? '';
  res.locals.managerNav = MANAGER_NAV.map(entry => ({
    label: entry.label,
    href: managerNavHref(entry),
    active: entry.path === '/manager'
      ? req.originalUrl === '/manager' || req.originalUrl === '/manager/'
      : req.originalUrl.startsWith(entry.path),
  }));
  next();
});
app.use("/manager", requireManager, managerRouter);

app.use('/users', requireAuth, usersRouter);
app.use('/activate', activateRouter);
app.use('/rsvp', rsvpRouter);

export default app;
