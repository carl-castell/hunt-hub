import express, { Express } from "express";
import path from "path";
import session from "express-session";
import ejsLayouts from 'express-ejs-layouts';
import helmet from 'helmet';
import connectPg from 'connect-pg-simple';
import pg from 'pg';

import { logger } from "./middlewares/logger";
import { requireAdmin, requireManager, requireAuth } from './middlewares/requireRole';
import { generalLimiter } from "./middlewares/rateLimiter";
import { generateCsrfToken, verifyCsrfToken } from './middlewares/csrf';

import homeRouter from "./routes/home";
import authRouter from "./routes/auth";
import adminRouter from "./routes/admin";
import managerRouter from "./routes/manager";
import usersRouter from './routes/users';
import activateRouter from './routes/activate';
import mapRouter from "./routes/map";
import rsvpRouter from './routes/rsvp';
import totpRouter from './routes/totp';

import { estatesTable } from './db/schema/estates';
import { db } from './db';
import { eq } from 'drizzle-orm';


const app: Express = express();
app.set('trust proxy', 1);
const PgStore = connectPg(session);

const sessionPool = new pg.Pool({
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
      "script-src": ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      "img-src": [
        "'self'", "data:",
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
      "worker-src": ["'self'", "https://unpkg.com"],
    },
  },
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

app.use(logger);
app.use(generalLimiter);
app.use(generateCsrfToken);
app.use(verifyCsrfToken);
app.use(express.static(path.join(process.cwd(), "public"), { maxAge: "7d" }));

app.use("/", homeRouter);
app.use("/", authRouter);
app.use("/", totpRouter);
app.use('/admin', requireAdmin, (req, res, next) => {
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
  next();
});
app.use("/manager", requireManager, managerRouter);

app.use('/users', requireAuth, usersRouter);
app.use('/activate', activateRouter);
app.use('/rsvp', rsvpRouter);

export default app;
