import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { accountsTable } from '../db/schema/accounts';
import { eq } from 'drizzle-orm';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'admin') return res.status(403).send('Forbidden');

  try {
    const [account] = await db
      .select({ active: accountsTable.active })
      .from(accountsTable)
      .where(eq(accountsTable.userId, req.session.user.id))
      .limit(1);

    if (!account?.active) return res.redirect('/login');
    next();
  } catch (err) {
    console.error('[requireAdmin]', err);
    res.status(500).send('Server error');
  }
}

export async function requireManager(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) return res.redirect('/login');

  try {
    const [row] = await db
      .select({ role: usersTable.role, active: accountsTable.active })
      .from(usersTable)
      .innerJoin(accountsTable, eq(accountsTable.userId, usersTable.id))
      .where(eq(usersTable.id, req.session.user.id))
      .limit(1);

    if (!row || row.role !== 'manager' || !row.active) return res.status(403).send('Forbidden');

    req.session.user.role = row.role;
    next();
  } catch (err) {
    console.error('[requireManager]', err);
    res.status(500).send('Server error');
  }
}


export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'staff') return res.status(403).send('Forbidden');
  next();
}

export function requireEstateAccess(req: Request, res: Response, next: NextFunction) {
  const user = req.session.user;
  if (!user) return res.redirect('/login');

  if (user.role === 'admin') return next();

  const estateId = Number(req.params.id);
  if (user.estateId !== estateId) return res.status(403).send('Forbidden');

  next();
}

export async function requireUserAccess(req: Request, res: Response, next: NextFunction) {
  const sessionUser = req.session.user;
  if (!sessionUser) return res.redirect('/login');

  if (sessionUser.role === 'admin') return next();

  const { id } = req.params;
  const [targetUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, Number(id)))
    .limit(1);

  if (!targetUser) return res.status(404).send('User not found');
  if (targetUser.estateId !== sessionUser.estateId) return res.status(403).send('Forbidden');

  next();
}
