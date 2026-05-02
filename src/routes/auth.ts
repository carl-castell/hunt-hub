import express, { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { usersTable } from '../db/schema/users';
import { accountsTable } from '../db/schema/accounts';
import { loginSchema } from '../schemas';
import { authLimiter } from '@/middlewares/rateLimiter';
import { audit } from '@/services/audit';

const authRouter: Router = express.Router();

// GET /login
authRouter.get('/login', (req: Request, res: Response) => {
  if (req.session.user) return redirectByRole(req, res);
  res.render('login', { layout: false, title: 'Hunt-Hub | Login', error: null });
});

// POST /login
authRouter.post('/login', authLimiter, async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.render('login', {
      layout: false,
      title: 'Hunt-Hub | Login',
      error: result.error.issues[0].message,
    });
  }

  const { email, password } = result.data;

  try {
    const [row] = await db
      .select()
      .from(accountsTable)
      .innerJoin(usersTable, eq(accountsTable.userId, usersTable.id))
      .where(eq(accountsTable.email, email))
      .limit(1);

    if (!row) {
      await audit({ event: 'failed_login', ip: req.ip, metadata: { email } });
      return res.render('login', { layout: false, title: 'Hunt-Hub | Login', error: 'Invalid email or password.' });
    }

    const { accounts: account, users: user } = row;

    if (!account.active) {
      await audit({ event: 'failed_login', ip: req.ip, metadata: { email, reason: 'inactive account' } });
      return res.render('login', {
        layout: false,
        title: 'Hunt-Hub | Login',
        error: 'Your account is inactive. Please reach out to management or an admin.',
      });
    }

    if (!account.password) {
      await audit({ event: 'failed_login', ip: req.ip, metadata: { email } });
      return res.render('login', { layout: false, title: 'Hunt-Hub | Login', error: 'Invalid email or password.' });
    }

    if (account.lockedUntil) {
      if (account.lockedUntil > new Date()) {
        return res.render('login', { layout: false, title: 'Hunt-Hub | Login', error: 'Account temporarily locked. Please try again later.' });
      }
      await db.update(accountsTable).set({ failedAttempts: 0, lockedUntil: null }).where(eq(accountsTable.userId, account.userId));
      account.failedAttempts = 0;
    }

    const passwordMatch = await bcrypt.compare(password, account.password);
    if (!passwordMatch) {
      const newCount = account.failedAttempts + 1;
      await db.update(accountsTable).set({
        failedAttempts: newCount,
        lockedUntil: newCount >= 10 ? new Date(Date.now() + 15 * 60 * 1000) : null,
      }).where(eq(accountsTable.userId, account.userId));
      await audit({ event: 'failed_login', ip: req.ip, metadata: { email } });
      return res.render('login', { layout: false, title: 'Hunt-Hub | Login', error: 'Invalid email or password.' });
    }

    if (account.failedAttempts > 0 || account.lockedUntil) {
      await db.update(accountsTable).set({ failedAttempts: 0, lockedUntil: null }).where(eq(accountsTable.userId, account.userId));
    }

    // Admin accounts require TOTP as a second factor (skipped when SKIP_TOTP=true)
    if (user.role === 'admin' && process.env.SKIP_TOTP !== 'true') {
      return req.session.regenerate((err) => {
        if (err) {
          console.error('[session regenerate error]', err);
          return res.render('login', { layout: false, title: 'Hunt-Hub | Login', error: 'Something went wrong. Please try again.' });
        }
        req.session.pendingAdminId = user.id;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('[session save error]', saveErr);
            return res.render('login', { layout: false, title: 'Hunt-Hub | Login', error: 'Something went wrong. Please try again.' });
          }
          return res.redirect(account.totpSecret ? '/totp' : '/totp/setup');
        });
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error('[session regenerate error]', err);
        return res.render('login', { layout: false, title: 'Hunt-Hub | Login', error: 'Something went wrong. Please try again.' });
      }
      req.session.user = {
        id:        user.id,
        firstName: user.firstName,
        lastName:  user.lastName,
        email:     account.email,
        role:      user.role,
        active:    account.active,
        estateId:  user.estateId ?? null,
      };
      req.session.save(async (saveErr) => {
        if (saveErr) {
          console.error('[session save error]', saveErr);
          return res.render('login', { layout: false, title: 'Hunt-Hub | Login', error: 'Something went wrong. Please try again.' });
        }
        await audit({ userId: user.id, event: 'login', ip: req.ip });
        return redirectByRole(req, res);
      });
    });

  } catch (err) {
    console.error('[login error]', err);
    return res.render('login', { layout: false, title: 'Hunt-Hub | Login', error: 'Something went wrong. Please try again.' });
  }
});

// POST /logout
authRouter.post('/logout', async (req: Request, res: Response) => {
  const userId = req.session.user?.id;
  const ip = req.ip;
  req.session.destroy(async () => {
    await audit({ userId, event: 'logout', ip });
    res.redirect('/login');
  });
});

function redirectByRole(req: Request, res: Response) {
  switch (req.session.user?.role) {
    case 'admin':   return res.redirect('/admin');
    case 'manager': return res.redirect('/manager');
    case 'staff':   return res.redirect('/staff');
    default:        return res.redirect('/login');
  }
}

export default authRouter;
