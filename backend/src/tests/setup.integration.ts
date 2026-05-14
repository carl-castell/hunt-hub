import { afterAll } from 'vitest';
import { db } from '@/db';
import { userAuthTokensTable, accountsTable, usersTable, estatesTable, auditLogsTable } from '@/db/schema';

afterAll(async () => {
  await db.delete(userAuthTokensTable);
  await db.delete(auditLogsTable);
  await db.delete(accountsTable);
  await db.delete(usersTable);
  await db.delete(estatesTable);
});
