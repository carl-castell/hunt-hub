import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { usersTable } from '@/db/schema';
import { accountsTable } from '@/db/schema/accounts';

export type UserAccess = {
  role: typeof usersTable.$inferSelect['role'];
  estateId: number | null;
  active: boolean;
};

/**
 * Current role, estate and active flag of a user, read fresh from the
 * database. The session only holds a snapshot from login time, so access
 * checks use this to notice a role change or a deactivated account at once.
 */
export async function getUserAccess(userId: number): Promise<UserAccess | null> {
  const [row] = await db
    .select({ role: usersTable.role, estateId: usersTable.estateId, active: accountsTable.active })
    .from(usersTable)
    .innerJoin(accountsTable, eq(accountsTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);

  return row ?? null;
}
