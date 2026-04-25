import { db } from '@/db';
import { usersTable } from '@/db/schema/users';
import { accountsTable } from '@/db/schema/accounts';
import { estatesTable } from '@/db/schema/estates';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import request from 'supertest';
import app from '@/app';

export const MANAGER_PASSWORD = 'TestPass123!';

export interface ManagerSetup {
  estateId: number;
  managerId: number;
  agent: ReturnType<typeof request.agent>;
}

export async function setupManager(tag = 'default'): Promise<ManagerSetup> {
  const [estate] = await db
    .insert(estatesTable)
    .values({ name: `${tag} Estate` })
    .returning();

  const [manager] = await db
    .insert(usersTable)
    .values({ firstName: 'Test', lastName: 'Manager', role: 'manager', estateId: estate.id })
    .returning();

  const email = `manager-${tag}-${estate.id}@test.com`;
  const hash = await bcrypt.hash(MANAGER_PASSWORD, 10);
  await db.insert(accountsTable).values({
    userId: manager.id, email, password: hash, active: true,
  });

  const agent = request.agent(app);
  await agent.post('/login').send({ email, password: MANAGER_PASSWORD });

  return { estateId: estate.id, managerId: manager.id, agent };
}

export async function teardown(estateId: number): Promise<void> {
  await db.delete(usersTable).where(eq(usersTable.estateId, estateId));
  await db.delete(estatesTable).where(eq(estatesTable.id, estateId));
}
