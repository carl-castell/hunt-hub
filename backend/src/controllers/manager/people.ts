import { Request, Response } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { usersTable } from '../../db/schema/users';
import { accountsTable } from '../../db/schema/accounts';
import { userAuthTokensTable } from '../../db/schema/user_auth_tokens';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getBaseUrl } from '@/utils/url';
import { sessionPool } from '@/app';
import { audit } from '@/services/audit';
import { logError } from '@/utils/logError';
import { createPersonSchema, updateRoleSchema } from '@/schemas';

export async function getPeople(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const people = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.estateId, user.estateId!), inArray(usersTable.role, ['manager', 'staff'])));

    people.sort((a, b) => {
      const order: Record<string, number> = { manager: 0, staff: 1 };
      const roleDiff = (order[a.role] ?? 9) - (order[b.role] ?? 9);
      return roleDiff !== 0 ? roleDiff : a.lastName.localeCompare(b.lastName);
    });

    res.render('manager/people', {
      title: 'People',
      user,
      people,
      breadcrumbs: [{ label: 'People' }],
    });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

const createUserSchema = createPersonSchema;

export async function postCreateUser(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const result = createUserSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    const { firstName, lastName, email, role } = result.data;

    const [existing] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.email, email))
      .limit(1);

    if (existing) return res.status(400).send('A user with that email already exists.');

    const throwawayPassword = await bcrypt.hash(crypto.randomUUID(), 10);
    const token = crypto.randomUUID();

    const [newUser] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(usersTable)
        .values({ firstName, lastName, role, estateId: user.estateId! })
        .returning();

      await tx.insert(accountsTable).values({ userId: created.id, email, password: throwawayPassword, active: false });

      await tx.insert(userAuthTokensTable).values({
        userId:    created.id,
        token,
        type:      'activation',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
      });

      return [created];
    });

    res.redirect(`/manager/people/${newUser.id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function getUser(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(id)))
      .limit(1);

    if (!targetUser || targetUser.estateId !== user.estateId) {
      return res.status(404).send('User not found');
    }

    const [authToken] = await db
      .select()
      .from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.userId, targetUser.id))
      .limit(1);

    const [account] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.userId, targetUser.id))
      .limit(1);

    const domain = getBaseUrl(req);

    const breadcrumbs = [{ label: 'Estate', href: '/manager/estate' }, { label: `${targetUser.firstName} ${targetUser.lastName}` }];
    res.render('manager/user', {
      title: 'People',
      user,
      targetUser: { ...targetUser, ...account },
      activationToken: targetUser.id === user.id ? null : (authToken?.token || null),
      domain,
      error: null,
      breadcrumbs,
    });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postUpdateUserRole(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(id)))
      .limit(1);

    if (!targetUser || targetUser.estateId !== user.estateId) {
      return res.status(404).send('User not found');
    }

    const [authToken] = await db
      .select()
      .from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.userId, targetUser.id))
      .limit(1);

    const [account] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.userId, targetUser.id))
      .limit(1);

    const domain = getBaseUrl(req);

    const result = updateRoleSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    if (targetUser.role === 'manager' && result.data.role === 'staff') {
      const allUsers = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.estateId, user.estateId!));

      const managerCount = allUsers.filter(u => u.role === 'manager').length;

      if (managerCount <= 1) {
        return res.render('manager/user', {
          title: 'People',
          user,
          targetUser: { ...targetUser, ...account },
          activationToken: targetUser.id === user.id ? null : (authToken?.token || null),
          domain,
          error: 'At least one manager must exist per estate. Assign another manager before changing this role.',
          breadcrumbs: [{ label: 'Estate', href: '/manager/estate' }, { label: `${targetUser.firstName} ${targetUser.lastName}` }],
        });
      }
    }

    await db
      .update(usersTable)
      .set({ role: result.data.role })
      .where(eq(usersTable.id, Number(id)));

    if (targetUser.id === user.id) {
      return req.session.destroy(() => res.redirect('/login'));
    }

    res.redirect(`/manager/people/${id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postDeactivateUser(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(id)))
      .limit(1);

    if (!targetUser || targetUser.estateId !== user.estateId) {
      return res.status(404).send('User not found');
    }

    await db
      .update(accountsTable)
      .set({ active: false })
      .where(eq(accountsTable.userId, Number(id)));

    await sessionPool.query(`DELETE FROM session WHERE sess->'user'->>'id' = $1`, [id]);
    res.redirect(`/manager/people/${id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postReactivateUser(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(id)))
      .limit(1);

    if (!targetUser || targetUser.estateId !== user.estateId) {
      return res.status(404).send('User not found');
    }

    await db
      .update(accountsTable)
      .set({ active: true })
      .where(eq(accountsTable.userId, Number(id)));

    res.redirect(`/manager/people/${id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postResendActivation(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(id)))
      .limit(1);

    if (!targetUser || targetUser.estateId !== user.estateId) {
      return res.status(404).send('User not found');
    }

    const token = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await tx.delete(userAuthTokensTable).where(eq(userAuthTokensTable.userId, Number(id)));
      await tx.insert(userAuthTokensTable).values({
        userId:    Number(id),
        token,
        type:      'activation',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
      });
    });

    res.redirect(`/manager/people/${id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postDeleteUser(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(id)))
      .limit(1);

    if (!targetUser || targetUser.estateId !== user.estateId) {
      return res.status(404).send('User not found');
    }

    // Cascades to accounts and auth tokens
    await db.delete(usersTable).where(eq(usersTable.id, Number(id)));

    await audit({
      event: 'user_deleted',
      userId: user.id,
      ip: req.ip,
      metadata: { targetUserId: Number(id) },
    });

    res.redirect('/manager/people');
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}
