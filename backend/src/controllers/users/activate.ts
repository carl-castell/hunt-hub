import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { accountsTable } from '../../db/schema/accounts';
import { userAuthTokensTable } from '../../db/schema/user_auth_tokens';
import { activateSchema } from '@/schemas';
import { audit } from '@/services/audit';
import { isPasswordPwned } from '@/services/hibp';
import { logError } from '@/utils/logError';

export async function getActivate(req: Request, res: Response) {
  try {
    const { token } = req.params;

    const [authToken] = await db
      .select()
      .from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.token, token))
      .limit(1);

    if (!authToken) return res.render('activate', { layout: false, error: 'Invalid or expired activation link.', token });
    if (authToken.expiresAt < new Date()) return res.render('activate', { layout: false, error: 'This activation link has expired.', token });

    res.render('activate', { layout: false, error: null, token });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postActivate(req: Request, res: Response) {
  try {
    const { token } = req.params;

    const result = activateSchema.safeParse(req.body);
    if (!result.success) {
      return res.render('activate', {
        layout: false,
        error: result.error.issues[0].message,
        token,
      });
    }

    const { password } = result.data;

    const [authToken] = await db
      .select()
      .from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.token, token))
      .limit(1);

    if (!authToken) return res.render('activate', { layout: false, error: 'Invalid or expired activation link.', token });
    if (authToken.expiresAt < new Date()) return res.render('activate', { layout: false, error: 'This activation link has expired.', token });

    if (await isPasswordPwned(password, { userId: authToken.userId, ip: req.ip })) {
      return res.render('activate', { layout: false, error: 'This password has appeared in a known data breach. Please choose a different password.', token });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.transaction(async (tx) => {
      await tx
        .update(accountsTable)
        .set({ password: hashedPassword, active: true })
        .where(eq(accountsTable.userId, authToken.userId));

      await tx
        .delete(userAuthTokensTable)
        .where(eq(userAuthTokensTable.id, authToken.id));
    });

    await audit({
      userId: authToken.userId,
      event: 'account_activated',
      ip: req.ip,
    });

    res.redirect('/login');
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}
