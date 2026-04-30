import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { usersTable } from '../../db/schema/users';
import { accountsTable } from '../../db/schema/accounts';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { isPasswordPwned } from '@/services/hibp';

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one number.')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character.'),
  confirmPassword: z.string().min(1),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'New passwords do not match.',
  path: ['confirmPassword'],
});

export async function getAccount(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const [fullUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    if (!fullUser) return res.status(404).send('User not found');

    res.render('manager/account', { title: 'Account', breadcrumbs: [{ label: 'Account' }], user, fullUser, error: null, success: null });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postChangePassword(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const result = changePasswordSchema.safeParse(req.body);
    if (!result.success) {
      const [fullUser] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);

      return res.render('manager/account', {
        title: 'Account', breadcrumbs: [{ label: 'Account' }],
        user,
        fullUser,
        error: result.error.issues[0].message,
        success: null,
      });
    }

    const { oldPassword, newPassword } = result.data;

    const [account] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.userId, user.id))
      .limit(1);

    if (!account) return res.status(404).send('Account not found');

    if (!account.password) {
      const [fullUser] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);

      return res.render('manager/account', {
        title: 'Account', breadcrumbs: [{ label: 'Account' }],
        user,
        fullUser,
        error: 'No password set. Please use your activation link.',
        success: null,
      });
    }

    const match = await bcrypt.compare(oldPassword, account.password);
    if (!match) {
      const [fullUser] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);

      return res.render('manager/account', {
        title: 'Account', breadcrumbs: [{ label: 'Account' }],
        user,
        fullUser,
        error: 'Current password is incorrect.',
        success: null,
      });
    }

    if (await isPasswordPwned(newPassword, { userId: user.id, ip: req.ip })) {
      const [fullUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
      return res.render('manager/account', {
        title: 'Account', breadcrumbs: [{ label: 'Account' }],
        user,
        fullUser,
        error: 'This password has appeared in a known data breach. Please choose a different password.',
        success: null,
      });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db
      .update(accountsTable)
      .set({ password: hashed })
      .where(eq(accountsTable.userId, user.id));

    const [fullUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    res.render('manager/account', {
      title: 'Account', breadcrumbs: [{ label: 'Account' }],
      user,
      fullUser,
      error: null,
      success: 'Password changed successfully.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}
