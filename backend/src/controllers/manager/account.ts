import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../../db';
import { usersTable } from '../../db/schema/users';
import { accountsTable } from '../../db/schema/accounts';
import bcrypt from 'bcrypt';
import { isPasswordPwned } from '@/services/hibp';
import { audit } from '@/services/audit';
import { sessionPool } from '@/app';
import { logError } from '@/utils/logError';
import { changePasswordSchema } from '@/schemas';

export async function getAccount(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const [[fullUser], [account]] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1),
      db.select({ wfsToken: accountsTable.wfsToken }).from(accountsTable).where(eq(accountsTable.userId, user.id)).limit(1),
    ]);

    if (!fullUser) return res.status(404).send('User not found');

    res.render('manager/account', {
      title: 'Account',
      breadcrumbs: [{ label: 'Account' }],
      user,
      fullUser,
      wfsToken: account?.wfsToken ?? null,
      newWfsToken: null,
      wfsBaseUrl: `${req.protocol}://${req.get('host')}/wfs`,
      error: null,
      success: null,
    });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postChangePassword(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const wfsBaseUrl = `${req.protocol}://${req.get('host')}/wfs`;

    const [[fullUser], [account]] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1),
      db.select().from(accountsTable).where(eq(accountsTable.userId, user.id)).limit(1),
    ]);

    if (!fullUser) return res.status(404).send('User not found');
    if (!account)  return res.status(404).send('Account not found');

    const wfsToken = account.wfsToken ?? null;

    const renderWithError = (error: string) =>
      res.render('manager/account', {
        title: 'Account', breadcrumbs: [{ label: 'Account' }],
        user, fullUser, wfsToken, newWfsToken: null, wfsBaseUrl, error, success: null,
      });

    const result = changePasswordSchema.safeParse(req.body);
    if (!result.success) return renderWithError(result.error.issues[0].message);

    const { oldPassword, newPassword } = result.data;

    if (!account.password) return renderWithError('No password set. Please use your activation link.');

    const match = await bcrypt.compare(oldPassword, account.password);
    if (!match) return renderWithError('Current password is incorrect.');

    if (await isPasswordPwned(newPassword, { userId: user.id, ip: req.ip })) {
      return renderWithError('This password has appeared in a known data breach. Please choose a different password.');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db
      .update(accountsTable)
      .set({ password: hashed })
      .where(eq(accountsTable.userId, user.id));

    await audit({ userId: user.id, event: 'password_changed', ip: req.ip });
    await sessionPool.query(`DELETE FROM session WHERE sess->'user'->>'id' = $1`, [String(user.id)]);
    req.session.destroy(() => res.redirect('/login'));
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

// ── WFS Token ─────────────────────────────────────────────────────────────────

export async function postGenerateWfsToken(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const token = crypto.randomBytes(32).toString('hex');

    await db
      .update(accountsTable)
      .set({ wfsToken: token })
      .where(eq(accountsTable.userId, user.id));

    await audit({ userId: user.id, event: 'wfs_token_generated', ip: req.ip });

    const [[fullUser], [account]] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1),
      db.select({ wfsToken: accountsTable.wfsToken }).from(accountsTable).where(eq(accountsTable.userId, user.id)).limit(1),
    ]);

    res.render('manager/account', {
      title: 'Account',
      breadcrumbs: [{ label: 'Account' }],
      user,
      fullUser,
      wfsToken: account?.wfsToken ?? null,
      newWfsToken: token,
      wfsBaseUrl: `${req.protocol}://${req.get('host')}/wfs`,
      error: null,
      success: null,
    });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postDeleteWfsToken(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    await db
      .update(accountsTable)
      .set({ wfsToken: null })
      .where(eq(accountsTable.userId, user.id));

    await audit({ userId: user.id, event: 'wfs_token_deleted', ip: req.ip });
    res.redirect('/manager/account');
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}
