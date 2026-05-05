import { afterAll, beforeAll } from 'vitest';
import { db } from '@/db';
import { userAuthTokensTable, accountsTable, usersTable, estatesTable, auditLogsTable } from '@/db/schema';

beforeAll(async () => {
  await db.delete(userAuthTokensTable);
  await db.delete(auditLogsTable);
  await db.delete(accountsTable);
  await db.delete(usersTable);
  await db.delete(estatesTable);
});

afterAll(async () => {
  await db.delete(userAuthTokensTable);
  await db.delete(auditLogsTable);
  await db.delete(accountsTable);
  await db.delete(usersTable);
  await db.delete(estatesTable);
});
