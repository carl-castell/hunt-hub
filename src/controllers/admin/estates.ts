import { Request, Response } from 'express';
import { db } from '../../db';
import { estatesTable, usersTable } from '../../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { createEstateSchema, renameEstateSchema } from '@/schemas';
import { audit } from '@/services/audit';
import { logError } from '@/utils/logError';

export async function createEstate(req: Request, res: Response) {
  try {
    const result = createEstateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.issues[0].message);
    }

    const [newEstate] = await db
      .insert(estatesTable)
      .values({ name: result.data.name })
      .returning();

    await audit({
      userId: req.session.user!.id,
      event: 'estate_created',
      ip: req.ip,
      metadata: { estateId: newEstate.id, name: newEstate.name },
    });

    res.redirect(`/admin/estates/${newEstate.id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function getEstate(req: Request, res: Response) {
  try {
    const user = req.session.user;
    const { id } = req.params;

    const [estate] = await db
      .select()
      .from(estatesTable)
      .where(eq(estatesTable.id, Number(id)))
      .limit(1);

    if (!estate) return res.status(404).send('Estate not found');

    const managers = await db
      .select()
      .from(usersTable)
      .where(and(
        eq(usersTable.estateId, Number(id)),
        inArray(usersTable.role, ['manager', 'staff'])
      ));

    res.render('admin/estate', {
      title: estate.name,
      user,
      estate,
      managers,
    });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function renameEstate(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const result = renameEstateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.issues[0].message);
    }

    await db
      .update(estatesTable)
      .set({ name: result.data.name })
      .where(eq(estatesTable.id, Number(id)));

    res.redirect(`/admin/estates/${id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function deleteEstate(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const estateId = Number(id);

    await db.transaction(async (tx) => {
      await tx.delete(usersTable).where(eq(usersTable.estateId, estateId));
      await tx.delete(estatesTable).where(eq(estatesTable.id, estateId));
    });

    await audit({
      userId: req.session.user!.id,
      event: 'estate_deleted',
      ip: req.ip,
      metadata: { estateId },
    });

    res.redirect('/admin');
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}
