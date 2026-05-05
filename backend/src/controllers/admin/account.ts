import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { usersTable } from '../../db/schema/users';
import { accountsTable } from '../../db/schema/accounts';
import bcrypt from 'bcrypt';
import { isPasswordPwned } from '@/services/hibp';
import { audit } from '@/services/audit';
import { sessionPool } from '@/app';
import { logError } from '@/utils/logError';
import { changePasswordSchema } from '@/schemas';

async function renderAccount(req: Request, res: Response, { error, success }: { error: string | null, success: string | null }) {
  const user = req.session.user!;
  const [fullUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  if (!fullUser) return res.status(404).send('User not found');
  res.render('admin/account', { title: 'Account', user, fullUser, error, success });
}

export async function getAccount(req: Request, res: Response) {
  try {
    await renderAccount(req, res, { error: null, success: null });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postChangePassword(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const result = changePasswordSchema.safeParse(req.body);
    if (!result.success) {
      return await renderAccount(req, res, { error: result.error.issues[0].message, success: null });
    }

    const { oldPassword, newPassword } = result.data;

    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.userId, user.id)).limit(1);
    if (!account) return res.status(404).send('Account not found');

    if (!account.password) {
      return await renderAccount(req, res, { error: 'No password set. Please use your activation link.', success: null });
    }

    const match = await bcrypt.compare(oldPassword, account.password);
    if (!match) {
      return await renderAccount(req, res, { error: 'Current password is incorrect.', success: null });
    }

    if (await isPasswordPwned(newPassword, { userId: user.id, ip: req.ip })) {
      return await renderAccount(req, res, { error: 'This password has appeared in a known data breach. Please choose a different password.', success: null });
    }

    await db.update(accountsTable).set({ password: await bcrypt.hash(newPassword, 10) }).where(eq(accountsTable.userId, user.id));

    await audit({ userId: user.id, event: 'password_changed', ip: req.ip });
    await sessionPool.query(`DELETE FROM session WHERE sess->'user'->>'id' = $1`, [String(user.id)]);
    req.session.destroy(() => res.redirect('/login'));
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}
