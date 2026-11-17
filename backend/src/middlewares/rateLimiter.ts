import rateLimit from 'express-rate-limit';
import { PostgresRateLimitStore } from './postgresRateLimitStore';

// All limiters count in Postgres (shared by every app instance), see postgresRateLimitStore.ts.

const isTest = process.env.NODE_ENV === 'test';

export const generalLimiter = rateLimit({
  store: new PostgresRateLimitStore('general'),
  windowMs: 15 * 60 * 1000,
  max: isTest ? 0 : 500,        // 0 = unlimited
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
});

export const authLimiter = rateLimit({
  store: new PostgresRateLimitStore('auth'),
  // Counted once per login call in a tRPC batch on purpose (see trpcAuthLimits.ts).
  validate: { singleCount: false },
  windowMs: 15 * 60 * 1000,
  max: isTest ? 0 : 20,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts, please try again later.',
});

export const rsvpUploadLimiter = rateLimit({
  store: new PostgresRateLimitStore('rsvpUpload'),
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: isTest ? 0 : 50,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many uploads, please try again later.',
});

export const backupCodeLimiter = rateLimit({
  store: new PostgresRateLimitStore('backupCode'),
  // Counted once per login call in a tRPC batch on purpose (see trpcAuthLimits.ts).
  validate: { singleCount: false },
  windowMs: 60 * 60 * 1000,
  max: isTest ? 0 : 10,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many backup code attempts, please try again later.',
});

export const activationLimiter = rateLimit({
  store: new PostgresRateLimitStore('activation'),
  windowMs: 60 * 60 * 1000,
  max: isTest ? 0 : 20,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many activation attempts, please try again later.',
});

export const rsvpLimiter = rateLimit({
  store: new PostgresRateLimitStore('rsvp'),
  windowMs: 15 * 60 * 1000,
  max: isTest ? 0 : 100,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
});