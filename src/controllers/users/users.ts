import { Request, Response } from 'express';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { usersTable, userAuthTokensTable } from '../../db/schema';
import { accountsTable } from '../../db/schema/accounts';
import { updateUserSchema } from '@/schemas';
import { audit } from '@/services/audit';

export async function getUser(req: Request, res: Response) {
  try {
    const sessionUser = req.session.user!;
    const { id } = req.params;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(id)))
      .limit(1);

    if (!user) return res.status(404).send('User not found');

    const [account] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.userId, user.id))
      .limit(1);

    const [authToken] = await db
      .select()
      .from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.userId, user.id))
      .limit(1);

    const domain = `${req.protocol}://${req.get('host')}`;

    res.render('admin/user', {
      layout: false,
      sessionUser,
      targetUser: { ...user, ...account },
      domain,
      activationToken: authToken?.token || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function updateUser(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(id)))
      .limit(1);

    if (!existing) return res.status(404).send('User not found');

    const result = updateUserSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.issues[0].message);
    }

    const { firstName, lastName, email } = result.data;

    await db
      .update(usersTable)
      .set({ firstName, lastName })
      .where(eq(usersTable.id, Number(id)));

    if (email) {
      await db
        .update(accountsTable)
        .set({ email })
        .where(eq(accountsTable.userId, Number(id)));
    }

    res.redirect(`/users/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function deactivateUser(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const sessionUser = req.session.user!;

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(id)))
      .limit(1);

    if (!existing) return res.status(404).send('User not found');

    await db
      .update(accountsTable)
      .set({ active: false })
      .where(eq(accountsTable.userId, Number(id)));

    await audit({
      userId: sessionUser.id,
      event: 'user_deactivated',
      ip: req.ip,
      metadata: { targetUserId: Number(id) },
    });

    res.redirect(`/users/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function reactivateUser(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const sessionUser = req.session.user!;

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(id)))
      .limit(1);

    if (!existing) return res.status(404).send('User not found');

    await db
      .update(accountsTable)
      .set({ active: true })
      .where(eq(accountsTable.userId, Number(id)));

    await audit({
      userId: sessionUser.id,
      event: 'user_reactivated',
      ip: req.ip,
      metadata: { targetUserId: Number(id) },
    });

    res.redirect(`/users/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function deleteUser(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const sessionUser = req.session.user!;

    const [row] = await db
      .select()
      .from(usersTable)
      .leftJoin(accountsTable, eq(accountsTable.userId, usersTable.id))
      .where(eq(usersTable.id, Number(id)))
      .limit(1);

    if (!row) return res.status(404).send('User not found');

    const { users: targetUser, accounts: account } = row;

    await db.delete(usersTable).where(eq(usersTable.id, Number(id)));

    await audit({
      userId: sessionUser.id,
      event: 'user_deleted',
      ip: req.ip,
      metadata: { targetUserId: Number(id), email: account?.email },
    });

    if (sessionUser.role === 'admin') {
      if (targetUser.estateId) return res.redirect(`/admin/estates/${targetUser.estateId}`);
      return res.redirect('/admin');
    }

    res.redirect('/manager');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function resendActivation(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const sessionUser = req.session.user!;

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(id)))
      .limit(1);

    if (!existing) return res.status(404).send('User not found');

    await db.delete(userAuthTokensTable).where(eq(userAuthTokensTable.userId, Number(id)));

    const token = crypto.randomUUID();
    await db.insert(userAuthTokensTable).values({
      userId:    Number(id),
      token,
      type:      'activation',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
    });

    await audit({
      userId: sessionUser.id,
      event: 'user_created',
      ip: req.ip,
      metadata: { targetUserId: Number(id) },
    });

    res.redirect(`/users/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}
