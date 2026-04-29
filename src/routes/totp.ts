import crypto from 'crypto';
import express, { Router, Request, Response, NextFunction } from 'express';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { accountsTable } from '../db/schema/accounts';
import { usersTable } from '../db/schema/users';
import { totpBackupCodesTable } from '../db/schema/totp_backup_codes';
import { audit } from '../audit';
import { authLimiter } from '@/middlewares/rateLimiter';

const totpRouter: Router = express.Router();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

function requirePending(req: Request, res: Response, next: NextFunction) {
  if (req.session.user) return res.redirect('/admin');
  if (!req.session.pendingAdminId) return res.redirect('/login');
  next();
}

function requireBackupCodes(req: Request, res: Response, next: NextFunction) {
  if (req.session.user) return res.redirect('/admin');
  if (!req.session.pendingAdminId || !req.session.pendingBackupCodes) return res.redirect('/login');
  next();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkToken(token: string, secret: string): boolean {
  return verifySync({ secret, token: token.trim() }).valid;
}

function generateBackupCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${hex.slice(0, 4)}-${hex.slice(4)}`;
  });
}

function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.replace(/-/g, '')).digest('hex');
}

async function completeAdminSession(req: Request, res: Response, userId: number) {
  const [row] = await db
    .select()
    .from(accountsTable)
    .innerJoin(usersTable, eq(accountsTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!row) return res.redirect('/login');

  const { accounts: account, users: user } = row;
  req.session.pendingAdminId = undefined;
  req.session.pendingTotpSecret = undefined;
  req.session.pendingBackupCodes = undefined;
  req.session.user = {
    id:        user.id,
    firstName: user.firstName,
    lastName:  user.lastName,
    email:     account.email,
    role:      user.role,
    active:    account.active,
    estateId:  user.estateId ?? null,
  };

  req.session.save(async (err) => {
    if (err) {
      console.error('[totp session save error]', err);
      return res.redirect('/login');
    }
    await audit({ userId: user.id, event: 'login', ip: req.ip });
    return res.redirect('/admin');
  });
}

// ---------------------------------------------------------------------------
// TOTP verify (normal login)
// ---------------------------------------------------------------------------

totpRouter.get('/totp', requirePending, (_req: Request, res: Response) => {
  res.render('totp-verify', {
    layout: false,
    title: 'Hunt-Hub | Two-Factor Authentication',
    error: null,
  });
});

totpRouter.post('/totp', authLimiter, requirePending, async (req: Request, res: Response) => {
  const userId = req.session.pendingAdminId!;
  const { token } = req.body;

  try {
    const [row] = await db
      .select({ totpSecret: accountsTable.totpSecret })
      .from(accountsTable)
      .where(eq(accountsTable.userId, userId))
      .limit(1);

    if (!row?.totpSecret) return res.redirect('/login');

    if (!checkToken(token, row.totpSecret)) {
      return res.render('totp-verify', {
        layout: false,
        title: 'Hunt-Hub | Two-Factor Authentication',
        error: 'Invalid code. Please try again.',
      });
    }

    await completeAdminSession(req, res, userId);
  } catch (err) {
    console.error('[totp verify error]', err);
    res.render('totp-verify', {
      layout: false,
      title: 'Hunt-Hub | Two-Factor Authentication',
      error: 'Something went wrong. Please try again.',
    });
  }
});

// ---------------------------------------------------------------------------
// TOTP setup (first login)
// ---------------------------------------------------------------------------

totpRouter.get('/totp/setup', requirePending, async (req: Request, res: Response) => {
  try {
    const [row] = await db
      .select({ email: accountsTable.email })
      .from(accountsTable)
      .where(eq(accountsTable.userId, req.session.pendingAdminId!))
      .limit(1);

    if (!row) return res.redirect('/login');

    if (!req.session.pendingTotpSecret) {
      req.session.pendingTotpSecret = generateSecret();
    }

    const otpauth = generateURI({
      label: row.email,
      issuer: 'Hunt-Hub',
      secret: req.session.pendingTotpSecret,
    });
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    res.render('totp-setup', {
      layout: false,
      title: 'Hunt-Hub | Set Up Two-Factor Authentication',
      qrDataUrl,
      secret: req.session.pendingTotpSecret,
      error: null,
    });
  } catch (err) {
    console.error('[totp setup GET error]', err);
    res.redirect('/login');
  }
});

totpRouter.post('/totp/setup', authLimiter, requirePending, async (req: Request, res: Response) => {
  const userId = req.session.pendingAdminId!;
  const secret = req.session.pendingTotpSecret;
  const { token } = req.body;

  if (!secret) return res.redirect('/totp/setup');

  if (!checkToken(token, secret)) {
    try {
      const [row] = await db
        .select({ email: accountsTable.email })
        .from(accountsTable)
        .where(eq(accountsTable.userId, userId))
        .limit(1);

      if (!row) return res.redirect('/login');

      const otpauth = generateURI({ label: row.email, issuer: 'Hunt-Hub', secret });
      const qrDataUrl = await QRCode.toDataURL(otpauth);

      return res.render('totp-setup', {
        layout: false,
        title: 'Hunt-Hub | Set Up Two-Factor Authentication',
        qrDataUrl,
        secret,
        error: 'Invalid code. Please scan the QR code and try again.',
      });
    } catch {
      return res.redirect('/login');
    }
  }

  try {
    await db.update(accountsTable)
      .set({ totpSecret: secret })
      .where(eq(accountsTable.userId, userId));

    const codes = generateBackupCodes();
    await db.insert(totpBackupCodesTable).values(
      codes.map(code => ({ userId, codeHash: hashBackupCode(code) }))
    );

    req.session.pendingBackupCodes = codes;
    req.session.save((err) => {
      if (err) {
        console.error('[totp setup session save error]', err);
        return res.redirect('/login');
      }
      res.redirect('/totp/backup-codes');
    });
  } catch (err) {
    console.error('[totp setup POST error]', err);
    res.redirect('/login');
  }
});

// ---------------------------------------------------------------------------
// Backup codes display & download (shown once after setup)
// ---------------------------------------------------------------------------

totpRouter.get('/totp/backup-codes', requireBackupCodes, (req: Request, res: Response) => {
  res.render('totp-backup-codes', {
    layout: false,
    title: 'Hunt-Hub | Save Your Backup Codes',
    codes: req.session.pendingBackupCodes!,
  });
});

totpRouter.get('/totp/backup-codes/download', requireBackupCodes, (req: Request, res: Response) => {
  const codes = req.session.pendingBackupCodes!;
  const lines = [
    'Hunt-Hub Admin Backup Codes',
    `Generated: ${new Date().toUTCString()}`,
    '',
    'Store these codes somewhere safe.',
    'Each code can only be used once.',
    '',
    ...codes,
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="hunt-hub-backup-codes.txt"');
  res.send(lines);
});

totpRouter.post('/totp/backup-codes/confirm', requireBackupCodes, async (req: Request, res: Response) => {
  await completeAdminSession(req, res, req.session.pendingAdminId!);
});

// ---------------------------------------------------------------------------
// Backup code login (recovery)
// ---------------------------------------------------------------------------

totpRouter.get('/totp/backup', requirePending, (_req: Request, res: Response) => {
  res.render('totp-backup', {
    layout: false,
    title: 'Hunt-Hub | Use Backup Code',
    error: null,
  });
});

totpRouter.post('/totp/backup', authLimiter, requirePending, async (req: Request, res: Response) => {
  const userId = req.session.pendingAdminId!;
  const raw: string = (req.body.code ?? '').trim().toUpperCase();

  if (!raw) {
    return res.render('totp-backup', {
      layout: false,
      title: 'Hunt-Hub | Use Backup Code',
      error: 'Please enter a backup code.',
    });
  }

  try {
    const hash = hashBackupCode(raw);
    const [match] = await db
      .select()
      .from(totpBackupCodesTable)
      .where(and(
        eq(totpBackupCodesTable.userId, userId),
        eq(totpBackupCodesTable.codeHash, hash),
        isNull(totpBackupCodesTable.usedAt),
      ))
      .limit(1);

    if (!match) {
      return res.render('totp-backup', {
        layout: false,
        title: 'Hunt-Hub | Use Backup Code',
        error: 'Invalid or already used backup code.',
      });
    }

    await db.update(totpBackupCodesTable)
      .set({ usedAt: new Date() })
      .where(eq(totpBackupCodesTable.id, match.id));

    // Invalidate TOTP and all backup codes — admin must re-enroll before proceeding
    await db.update(accountsTable)
      .set({ totpSecret: null })
      .where(eq(accountsTable.userId, userId));
    await db.delete(totpBackupCodesTable)
      .where(eq(totpBackupCodesTable.userId, userId));

    req.session.pendingTotpSecret = undefined;
    req.session.save((err) => {
      if (err) {
        console.error('[totp backup session save error]', err);
        return res.redirect('/login');
      }
      res.redirect('/totp/setup');
    });
  } catch (err) {
    console.error('[totp backup error]', err);
    res.render('totp-backup', {
      layout: false,
      title: 'Hunt-Hub | Use Backup Code',
      error: 'Something went wrong. Please try again.',
    });
  }
});

export default totpRouter;
