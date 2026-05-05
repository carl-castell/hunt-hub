import { Request, Response } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { estatesTable } from '../../db/schema/estates';
import { areasTable } from '../../db/schema/areas';
import { usersTable } from '../../db/schema/users';
import { logError } from '@/utils/logError';
import { renameEstateSchema } from '@/schemas';

export async function getEstate(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const [estate] = await db
      .select()
      .from(estatesTable)
      .where(eq(estatesTable.id, user.estateId!))
      .limit(1);

    if (!estate) return res.status(404).send('Estate not found');

    const areas = await db
      .select()
      .from(areasTable)
      .where(eq(areasTable.estateId, user.estateId!));

    const allPeople = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.estateId, user.estateId!), inArray(usersTable.role, ['manager', 'staff'])));

    const people = allPeople.sort((a, b) => {
      const roleOrder: Record<string, number> = { manager: 0, staff: 1, admin: 2, guest: 3 };
      const roleDiff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
      if (roleDiff !== 0) return roleDiff;
      return a.lastName.localeCompare(b.lastName);
    });

    res.render('manager/estate/show', {
      title: 'Estate',
      user,
      estate,
      areas,
      people,
      breadcrumbs: [{ label: 'Estate' }],
    });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postRenameEstate(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const result = renameEstateSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    await db
      .update(estatesTable)
      .set({ name: result.data.name })
      .where(eq(estatesTable.id, user.estateId!));

    res.redirect('/manager/estate');
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}
