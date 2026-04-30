import { Request, Response } from 'express';
import { and, asc, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '../../db';
import { usersTable } from '../../db/schema/users';
import { contactsTable } from '../../db/schema/contacts';
import { huntingLicensesTable, trainingCertificatesTable } from '../../db/schema/licenses';
import { guestGroupsTable, guestGroupMembersTable } from '../../db/schema/guest_groups';
import { z } from 'zod';

const optionalString = z.string().transform(v => v === '' ? undefined : v).pipe(z.string().min(1).optional());

const createGuestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: optionalString,
  dateOfBirth: optionalString,
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

const updateGuestSchema = createGuestSchema;

const GUESTS_LIMIT = 50;

const sortColumns = {
  firstName:   () => usersTable.firstName,
  lastName:    () => usersTable.lastName,
  dateOfBirth: () => contactsTable.dateOfBirth,
  rating:      () => contactsTable.rating,
} as const;

export async function getGuests(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { search, sortBy, sortDir, offset: offsetParam } = req.query as {
      search?: string; sortBy?: string; sortDir?: string; offset?: string;
    };

    const offset   = Math.max(0, Number(offsetParam) || 0);
    const term     = search?.trim() ?? '';
    const isPartial = req.headers['hx-request'] === 'true';

    const col      = sortBy && sortBy in sortColumns
      ? sortColumns[sortBy as keyof typeof sortColumns]()
      : null;
    const orderExpr = col ? (sortDir === 'desc' ? desc(col) : asc(col)) : asc(usersTable.lastName);

    const estateWhere = eq(usersTable.estateId, user.estateId!);
    const whereClause = term
      ? and(estateWhere, or(
          ilike(usersTable.firstName, `%${term}%`),
          ilike(usersTable.lastName, `%${term}%`),
          inArray(usersTable.id,
            db.select({ userId: guestGroupMembersTable.userId })
              .from(guestGroupMembersTable)
              .innerJoin(guestGroupsTable, eq(guestGroupMembersTable.groupId, guestGroupsTable.id))
              .where(and(eq(guestGroupsTable.estateId, user.estateId!), ilike(guestGroupsTable.name, `%${term}%`)))
          )
        ))
      : estateWhere;

    const [[{ total }], [{ grandTotal }]] = await Promise.all([
      db.select({ total: count() }).from(contactsTable).innerJoin(usersTable, eq(contactsTable.userId, usersTable.id)).where(whereClause),
      db.select({ grandTotal: count() }).from(contactsTable).innerJoin(usersTable, eq(contactsTable.userId, usersTable.id)).where(estateWhere),
    ]);

    const rows = await db
      .select()
      .from(contactsTable)
      .innerJoin(usersTable, eq(contactsTable.userId, usersTable.id))
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(GUESTS_LIMIT + 1)
      .offset(offset);

    const hasMore = rows.length > GUESTS_LIMIT;
    const guests  = rows.slice(0, GUESTS_LIMIT).map(r => ({ ...r.users, ...r.contacts }));

    const guestIds = guests.map(g => g.id);
    const groupRows = guestIds.length > 0
      ? await db
          .select({ userId: guestGroupMembersTable.userId, groupName: guestGroupsTable.name })
          .from(guestGroupMembersTable)
          .innerJoin(guestGroupsTable, eq(guestGroupMembersTable.groupId, guestGroupsTable.id))
          .where(and(
            eq(guestGroupsTable.estateId, user.estateId!),
            inArray(guestGroupMembersTable.userId, guestIds)
          ))
      : [];

    const groupsByUser = new Map<number, string[]>();
    for (const r of groupRows) {
      const names = groupsByUser.get(r.userId) ?? [];
      names.push(r.groupName);
      groupsByUser.set(r.userId, names);
    }
    const guestsWithGroups = guests.map(g => ({ ...g, groups: groupsByUser.get(g.id) ?? [] }));

    const viewData = { user, guests: guestsWithGroups, total, grandTotal, search: term, sortBy: sortBy ?? '', sortDir: sortDir ?? '', hasMore, nextOffset: offset + GUESTS_LIMIT };

    if (isPartial) {
      res.locals.layout = false;
      return res.render('manager/guests/list-rows', viewData);
    }
    res.render('manager/guests/list', { title: 'Guests', ...viewData, breadcrumbs: [{ label: 'Guests' }] });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function getNewGuest(req: Request, res: Response) {
  res.render('manager/guests/new', { title: 'Add Guest', breadcrumbs: [{ label: 'Guests', href: '/manager/guests' }, { label: 'New Guest' }], user: req.session.user!, error: null });
}

export async function postCreateGuest(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const result = createGuestSchema.safeParse(req.body);
    if (!result.success) {
      return res.render('manager/guests/new', {
        title: 'Add Guest',
        user,
        error: result.error.issues[0].message,
      });
    }

    const { firstName, lastName, email, phone, dateOfBirth, rating } = result.data;

    const [newUser] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(usersTable)
        .values({ firstName, lastName, role: 'guest', estateId: user.estateId! })
        .returning();

      await tx.insert(contactsTable).values({ userId: created.id, email, phone, dateOfBirth, rating });

      return [created];
    });

    res.redirect(`/manager/guests/${newUser.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function getGuest(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const guestId = Number(req.params.id);

    if (!Number.isFinite(guestId)) {
      return res.status(400).send('Invalid guest id');
    }

    const [row] = await db
      .select()
      .from(contactsTable)
      .innerJoin(usersTable, eq(contactsTable.userId, usersTable.id))
      .where(eq(contactsTable.userId, guestId))
      .limit(1);

    if (!row || row.users.estateId !== user.estateId) return res.status(404).send('Guest not found');

    const guest = { ...row.users, ...row.contacts };

    const [licenses, certificates, guestGroupRows, allGroups] = await Promise.all([
      db.select().from(huntingLicensesTable).where(eq(huntingLicensesTable.userId, guestId)).orderBy(desc(huntingLicensesTable.uploadDate)),
      db.select().from(trainingCertificatesTable).where(eq(trainingCertificatesTable.userId, guestId)).orderBy(desc(trainingCertificatesTable.uploadDate)),
      db.select({ id: guestGroupsTable.id, name: guestGroupsTable.name })
        .from(guestGroupMembersTable)
        .innerJoin(guestGroupsTable, eq(guestGroupMembersTable.groupId, guestGroupsTable.id))
        .where(eq(guestGroupMembersTable.userId, guestId))
        .orderBy(guestGroupsTable.name),
      db.select({ id: guestGroupsTable.id, name: guestGroupsTable.name })
        .from(guestGroupsTable)
        .where(eq(guestGroupsTable.estateId, user.estateId!))
        .orderBy(guestGroupsTable.name),
    ]);

    const assignedGroupIds = new Set(guestGroupRows.map(g => g.id));
    const availableGroups = allGroups.filter(g => !assignedGroupIds.has(g.id));

    res.render('manager/guests/show', {
      title: 'Guest',
      user,
      guest,
      licenses,
      certificates,
      guestGroups: guestGroupRows,
      availableGroups,
      breadcrumbs: [{ label: 'Guests', href: '/manager/guests' }, { label: `${guest.firstName} ${guest.lastName}` }],
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}


export async function postGuestRemoveFromGroup(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const guestId = Number(req.params.id);
    const groupId = Number(req.params.groupId);
    if (!Number.isFinite(guestId) || !Number.isFinite(groupId)) return res.status(400).send('Invalid id');

    const [group] = await db
      .select()
      .from(guestGroupsTable)
      .where(and(eq(guestGroupsTable.id, groupId), eq(guestGroupsTable.estateId, user.estateId!)))
      .limit(1);
    if (!group) return res.status(404).send('Group not found');

    await db.delete(guestGroupMembersTable).where(
      and(eq(guestGroupMembersTable.groupId, groupId), eq(guestGroupMembersTable.userId, guestId))
    );
    res.redirect(`/manager/guests/${guestId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postGuestAddToGroup(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const guestId = Number(req.params.id);
    if (!Number.isFinite(guestId)) return res.status(400).send('Invalid guest id');

    const [guestRow] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, guestId), eq(usersTable.estateId, user.estateId!)))
      .limit(1);
    if (!guestRow) return res.status(404).send('Guest not found');

    const newGroupName = (req.body.newGroupName as string | undefined)?.trim();
    const groupId = Number(req.body.groupId);

    let targetGroupId: number;

    if (newGroupName) {
      const [created] = await db
        .insert(guestGroupsTable)
        .values({ name: newGroupName, estateId: user.estateId! })
        .returning();
      targetGroupId = created.id;
    } else if (Number.isFinite(groupId)) {
      const [group] = await db
        .select()
        .from(guestGroupsTable)
        .where(and(eq(guestGroupsTable.id, groupId), eq(guestGroupsTable.estateId, user.estateId!)))
        .limit(1);
      if (!group) return res.status(404).send('Group not found');
      targetGroupId = groupId;
    } else {
      return res.status(400).send('Select a group or enter a new group name');
    }

    await db.insert(guestGroupMembersTable).values({ groupId: targetGroupId, userId: guestId }).onConflictDoNothing();
    res.redirect(`/manager/guests/${guestId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postUpdateGuest(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [row] = await db
      .select()
      .from(contactsTable)
      .innerJoin(usersTable, eq(contactsTable.userId, usersTable.id))
      .where(eq(contactsTable.userId, Number(id)))
      .limit(1);

    if (!row || row.users.estateId !== user.estateId) return res.status(404).send('Guest not found');

    const result = updateGuestSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    const { firstName, lastName, email, phone, dateOfBirth, rating } = result.data;

    await db.transaction(async (tx) => {
      await tx.update(usersTable).set({ firstName, lastName }).where(eq(usersTable.id, Number(id)));
      await tx.update(contactsTable).set({ email, phone, dateOfBirth, rating }).where(eq(contactsTable.userId, Number(id)));
    });

    res.redirect(`/manager/guests/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postDeleteGuest(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [row] = await db
      .select()
      .from(contactsTable)
      .innerJoin(usersTable, eq(contactsTable.userId, usersTable.id))
      .where(eq(contactsTable.userId, Number(id)))
      .limit(1);

    if (!row || row.users.estateId !== user.estateId) return res.status(404).send('Guest not found');

    await db.delete(usersTable).where(eq(usersTable.id, Number(id)));

    res.redirect('/manager/guests');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}
