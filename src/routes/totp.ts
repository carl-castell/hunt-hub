import express, { Router, Request, Response, NextFunction } from 'express';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { accountsTable } from '../db/schema/accounts';
import { usersTable } from '../db/schema/users';
import { audit } from '../audit';

const totpRouter: Router = express.Router();

function requirePending(req: Request, res: Response, next: NextFunction) {
  if (req.session.user) return res.redirect('/admin');
  if (!req.session.pendingAdminId) return res.redirect('/login');
  next();
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

function checkToken(token: string, secret: string): boolean {
  return verifySync({ secret, token: token.trim() }).valid;
}

// GET /totp
totpRouter.get('/totp', requirePending, (_req: Request, res: Response) => {
  res.render('totp-verify', {
    layout: false,
    title: 'Hunt-Hub | Two-Factor Authentication',
    error: null,
  });
});

// POST /totp
totpRouter.post('/totp', requirePending, async (req: Request, res: Response) => {
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

// GET /totp/setup
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

// POST /totp/setup
totpRouter.post('/totp/setup', requirePending, async (req: Request, res: Response) => {
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

    await completeAdminSession(req, res, userId);
  } catch (err) {
    console.error('[totp setup POST error]', err);
    res.redirect('/login');
  }
});

export default totpRouter;
