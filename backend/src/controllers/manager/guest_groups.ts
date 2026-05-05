import { Request, Response } from 'express';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../../db';
import { guestGroupsTable, guestGroupMembersTable } from '../../db/schema/guest_groups';
import { usersTable } from '../../db/schema/users';
import { z } from 'zod';
import { logError } from '@/utils/logError';

const nameSchema = z.object({ name: z.string().min(1).max(255) });

function resolveGroup(req: Request, res: Response) {
  const user = req.session.user!;
  const groupId = Number(req.params.id);
  if (!Number.isFinite(groupId)) { res.status(400).send('Invalid group id'); return null; }
  return { user, groupId };
}

async function findGroup(groupId: number, estateId: number) {
  const [group] = await db
    .select()
    .from(guestGroupsTable)
    .where(and(eq(guestGroupsTable.id, groupId), eq(guestGroupsTable.estateId, estateId)))
    .limit(1);
  return group ?? null;
}

export async function getGroups(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const groups = await db
      .select({ id: guestGroupsTable.id, name: guestGroupsTable.name, memberCount: count(guestGroupMembersTable.id) })
      .from(guestGroupsTable)
      .leftJoin(guestGroupMembersTable, eq(guestGroupMembersTable.groupId, guestGroupsTable.id))
      .where(eq(guestGroupsTable.estateId, user.estateId!))
      .groupBy(guestGroupsTable.id)
      .orderBy(guestGroupsTable.name);

    res.render('manager/guests/groups', { title: 'Guest Groups', user, groups, breadcrumbs: [{ label: 'Guests', href: '/manager/guests' }, { label: 'Guest Groups' }] });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postCreateGroup(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const result = nameSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    const [group] = await db
      .insert(guestGroupsTable)
      .values({ name: result.data.name, estateId: user.estateId! })
      .returning();

    res.redirect(`/manager/guest-groups/${group.id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function getGroup(req: Request, res: Response) {
  try {
    const ctx = resolveGroup(req, res);
    if (!ctx) return;
    const { user, groupId } = ctx;

    const group = await findGroup(groupId, user.estateId!);
    if (!group) return res.status(404).send('Group not found');

    const memberRows = await db
      .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(guestGroupMembersTable)
      .innerJoin(usersTable, eq(guestGroupMembersTable.userId, usersTable.id))
      .where(eq(guestGroupMembersTable.groupId, groupId))
      .orderBy(usersTable.lastName, usersTable.firstName);

    res.render('manager/guests/group', { title: group.name, user, group, members: memberRows, breadcrumbs: [{ label: 'Guests', href: '/manager/guests' }, { label: 'Guest Groups', href: '/manager/guest-groups' }, { label: group.name }] });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postRenameGroup(req: Request, res: Response) {
  try {
    const ctx = resolveGroup(req, res);
    if (!ctx) return;
    const { user, groupId } = ctx;

    const group = await findGroup(groupId, user.estateId!);
    if (!group) return res.status(404).send('Group not found');

    const result = nameSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    await db.update(guestGroupsTable).set({ name: result.data.name }).where(eq(guestGroupsTable.id, groupId));
    res.redirect(`/manager/guest-groups/${groupId}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postDeleteGroup(req: Request, res: Response) {
  try {
    const ctx = resolveGroup(req, res);
    if (!ctx) return;
    const { user, groupId } = ctx;

    const group = await findGroup(groupId, user.estateId!);
    if (!group) return res.status(404).send('Group not found');

    await db.delete(guestGroupsTable).where(eq(guestGroupsTable.id, groupId));
    res.redirect('/manager/guest-groups');
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postAddMember(req: Request, res: Response) {
  try {
    const ctx = resolveGroup(req, res);
    if (!ctx) return;
    const { user, groupId } = ctx;

    const group = await findGroup(groupId, user.estateId!);
    if (!group) return res.status(404).send('Group not found');

    const userId = Number(req.body.userId);
    if (!Number.isFinite(userId)) return res.status(400).send('Invalid user id');

    const [guest] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.estateId, user.estateId!), eq(usersTable.role, 'guest')))
      .limit(1);
    if (!guest) return res.status(404).send('Guest not found');

    await db.insert(guestGroupMembersTable).values({ groupId, userId }).onConflictDoNothing();
    res.redirect(`/manager/guest-groups/${groupId}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postRemoveMember(req: Request, res: Response) {
  try {
    const ctx = resolveGroup(req, res);
    if (!ctx) return;
    const { user, groupId } = ctx;

    const group = await findGroup(groupId, user.estateId!);
    if (!group) return res.status(404).send('Group not found');

    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) return res.status(400).send('Invalid user id');

    await db.delete(guestGroupMembersTable).where(
      and(eq(guestGroupMembersTable.groupId, groupId), eq(guestGroupMembersTable.userId, userId))
    );
    res.redirect(`/manager/guest-groups/${groupId}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}
