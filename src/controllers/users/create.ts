import { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../../db';
import { usersTable, userAuthTokensTable } from '../../db/schema';
import { accountsTable } from '../../db/schema/accounts';
import { createManagerSchema } from '@/schemas';
import { renderTemplate, sendMail } from '@/services/mail';
import { getBaseUrl } from '@/utils/url';
import { logError } from '@/utils/logError';

export async function createManager(req: Request, res: Response) {
  try {
    const caller = req.session.user!;

    if (caller.role !== 'admin' && caller.role !== 'manager') {
      return res.status(403).send('Forbidden');
    }

    const result = createManagerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.issues[0].message);
    }

    const { firstName, lastName, email } = result.data;

    // Managers are always scoped to their own estate; admins may specify any estate.
    const estateId = caller.role === 'manager' ? caller.estateId! : Number(result.data.estateId);

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48);

    await db.transaction(async (tx) => {
      const [manager] = await tx
        .insert(usersTable)
        .values({ firstName, lastName, role: 'manager', estateId })
        .returning();

      await tx.insert(accountsTable).values({ userId: manager.id, email, password: null, active: false });

      await tx.insert(userAuthTokensTable).values({ userId: manager.id, token, type: 'activation', expiresAt });
    });

    try {
      const baseUrl = getBaseUrl(req);
      const activationLink = `${baseUrl}/activate/${token}`;

      const html = await renderTemplate('activation', {
        firstName,
        activationLink,
        year: new Date().getFullYear(),
        expiresAt,
      });

      await sendMail({
        to: email,
        subject: 'Activate your Hunt Hub account',
        html,
      });
    } catch (emailErr) {
      logError('[email error] Failed to send activation email:', emailErr);
    }

    if (caller.role === 'manager') {
      return res.redirect('/manager/people');
    }

    res.redirect(`/admin/estates/${estateId}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}
