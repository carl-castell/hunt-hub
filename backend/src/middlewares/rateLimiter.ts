import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 0 : 500,        // 0 = unlimited
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 0 : 20,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts, please try again later.',
});

export const rsvpUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: isTest ? 0 : 50,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many uploads, please try again later.',
});

export const backupCodeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isTest ? 0 : 10,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many backup code attempts, please try again later.',
});

export const activationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isTest ? 0 : 20,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many activation attempts, please try again later.',
});

export const rsvpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 0 : 100,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
});