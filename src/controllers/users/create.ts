import { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../../db';
import { usersTable, userAuthTokensTable } from '../../db/schema';
import { accountsTable } from '../../db/schema/accounts';
import { createManagerSchema } from '@/schemas';
import { renderTemplate, sendMail } from '@/services/mail';

export async function createManager(req: Request, res: Response) {
  try {
    const result = createManagerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.issues[0].message);
    }

    const { firstName, lastName, email, estateId } = result.data;

    // Insert into usersTable (no password/email/active here anymore)
    const [newManager] = await db
      .insert(usersTable)
      .values({
        firstName,
        lastName,
        role: 'manager',
        estateId: Number(estateId),
      })
      .returning();

    // Insert into accountsTable
    await db.insert(accountsTable).values({
      userId: newManager.id,
      email,
      password: null,
      active: false,
    });

    // Create activation token — expires in 48 hours
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48);

    await db.insert(userAuthTokensTable).values({
      userId: newManager.id,
      token,
      type: 'activation',
      expiresAt,
    });

    // Send activation email
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
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
      console.error('[email error] Failed to send activation email:', emailErr);
    }

    res.redirect(`/admin/estates/${estateId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}
