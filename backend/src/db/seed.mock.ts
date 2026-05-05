import { faker } from '@faker-js/faker';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '@/db';
import { estatesTable, usersTable, accountsTable, userAuthTokensTable, contactsTable, guestGroupsTable, guestGroupMembersTable, eventsTable, invitationsTable } from '@/db/schema';

// ── seed config ─────────────────────────────────
const GUEST_COUNT       = 500;
const MANAGER_EMAIL     = 'a@a.de';
const MANAGER_PASSWORD  = 'jjjjjjjj';
const ESTATE_NAME       = 'Mock Estate';
const GROUP_COUNT       = 7;
const GUESTS_PER_GROUP  = 50;
const PAST_EVENTS       = 40;
const FUTURE_EVENTS     = 10;
const GUESTS_PER_EVENT  = 80;

const FILLER_BEFORE = { name: 'Filler Estate Alpha', guests: 500000, events: 30,  invitationsPerEvent: 90 };
const FILLER_AFTER  = { name: 'Filler Estate Beta',  guests: 500000, events: 30, invitationsPerEvent: 90 };
// ─────────────────────────────────────────────────

const CHUNK_SIZE = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function seedFillerEstate(config: { name: string; guests: number; events: number; invitationsPerEvent: number }) {
  const [estate] = await db.insert(estatesTable).values({ name: config.name }).returning();

  const userValues = Array.from({ length: config.guests }, () => ({
    firstName: faker.person.firstName(),
    lastName:  faker.person.lastName(),
    role:      'guest' as const,
    estateId:  estate.id,
  }));

  const guestUsers: (typeof usersTable.$inferSelect)[] = [];
  for (const batch of chunk(userValues, CHUNK_SIZE)) {
    guestUsers.push(...await db.insert(usersTable).values(batch).returning());
  }

  const contactValues = guestUsers.map(g => ({
    userId:      g.id,
    email:       faker.internet.email({ firstName: g.firstName, lastName: g.lastName }),
    phone:       faker.phone.number({ style: 'national' }),
    dateOfBirth: faker.date.birthdate({ min: 18, max: 80, mode: 'age' }).toISOString().split('T')[0],
    rating:      faker.number.int({ min: 1, max: 5 }),
  }));
  for (const batch of chunk(contactValues, CHUNK_SIZE)) {
    await db.insert(contactsTable).values(batch);
  }

  const eventValues = Array.from({ length: config.events }, () => ({
    estateId:  estate.id,
    eventName: faker.word.adjective() + ' ' + faker.word.noun(),
    date:      faker.date.future({ years: 1 }).toISOString().split('T')[0],
    time:      '10:00:00',
  }));

  const fillerEvents: (typeof eventsTable.$inferSelect)[] = [];
  for (const batch of chunk(eventValues, CHUNK_SIZE)) {
    fillerEvents.push(...await db.insert(eventsTable).values(batch).returning());
  }

  for (const event of fillerEvents) {
    const invitationValues = faker.helpers.shuffle([...guestUsers])
      .slice(0, config.invitationsPerEvent)
      .map(g => ({
        publicId: crypto.randomUUID(),
        eventId:  event.id,
        userId:   g.id,
      }));
    for (const batch of chunk(invitationValues, CHUNK_SIZE)) {
      await db.insert(invitationsTable).values(batch);
    }
  }

  console.log(`  ✔ Filler estate "${estate.name}" — ${config.guests} guests, ${config.events} events, ${config.invitationsPerEvent} invitations/event`);
}

export async function seedMockData() {
  console.log('> Seeding mock data...');

  // ── filler estate before mock ──────────────────
  await seedFillerEstate(FILLER_BEFORE);

  // 1. Create one estate
  const [estate] = await db
    .insert(estatesTable)
    .values({ name: ESTATE_NAME })
    .returning();

  console.log(`  ✔ Estate created: "${estate.name}" (id: ${estate.id})`);

  // 2. Create the manager user
  const [manager] = await db
    .insert(usersTable)
    .values({
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      role: 'manager',
      estateId: estate.id,
    })
    .returning();

  console.log(`  ✔ Manager created: ${manager.firstName} ${manager.lastName} (id: ${manager.id})`);

  // 3. Create the manager's account
  await db.insert(accountsTable).values({
    userId: manager.id,
    email: MANAGER_EMAIL,
    password: await bcrypt.hash(MANAGER_PASSWORD, 10),
    active: true,
  });

  console.log(`  ✔ Account created — email: ${MANAGER_EMAIL} / password: ${MANAGER_PASSWORD}`);

  // 4. Create an activation token (for testing the onboarding flow)
  const token = crypto.randomBytes(32).toString('hex');

  await db.insert(userAuthTokensTable).values({
    userId: manager.id,
    token,
    type: 'activation',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });

  console.log(`  ✔ Activation token created: ${token}`);

  // 5. Create guests
  const userValues = Array.from({ length: GUEST_COUNT }, () => ({
    firstName: faker.person.firstName(),
    lastName:  faker.person.lastName(),
    role:      'guest' as const,
    estateId:  estate.id,
  }));

  const guestUsers: (typeof usersTable.$inferSelect)[] = [];
  for (const batch of chunk(userValues, CHUNK_SIZE)) {
    guestUsers.push(...await db.insert(usersTable).values(batch).returning());
  }

  const contactValues = guestUsers.map(g => ({
    userId:      g.id,
    email:       faker.internet.email({ firstName: g.firstName, lastName: g.lastName }),
    phone:       faker.phone.number({ style: 'national' }),
    dateOfBirth: faker.date.birthdate({ min: 18, max: 80, mode: 'age' }).toISOString().split('T')[0],
    rating:      faker.number.int({ min: 1, max: 5 }),
  }));
  for (const batch of chunk(contactValues, CHUNK_SIZE)) {
    await db.insert(contactsTable).values(batch);
  }

  console.log(`  ✔ ${GUEST_COUNT} guests created`);

  // 6. Create guest groups and assign guests
  const groups = await db
    .insert(guestGroupsTable)
    .values(
      Array.from({ length: GROUP_COUNT }, () => ({
        name:     faker.word.adjective() + ' Group',
        estateId: estate.id,
      }))
    )
    .returning();

  const memberValues = groups.flatMap(group =>
    faker.helpers.shuffle([...guestUsers])
      .slice(0, GUESTS_PER_GROUP)
      .map(g => ({ groupId: group.id, userId: g.id }))
  );
  for (const batch of chunk(memberValues, CHUNK_SIZE)) {
    await db.insert(guestGroupMembersTable).values(batch);
  }

  console.log(`  ✔ ${GROUP_COUNT} groups created with ${GUESTS_PER_GROUP} guests each`);

  // 7. Create events (past + future)
  const eventValues = [
    ...Array.from({ length: PAST_EVENTS }, () => ({
      estateId:  estate.id,
      eventName: faker.word.adjective() + ' ' + faker.word.noun(),
      date:      faker.date.past({ years: 1 }).toISOString().split('T')[0],
      time:      '10:00:00',
    })),
    ...Array.from({ length: FUTURE_EVENTS }, () => ({
      estateId:  estate.id,
      eventName: faker.word.adjective() + ' ' + faker.word.noun(),
      date:      faker.date.future({ years: 1 }).toISOString().split('T')[0],
      time:      '10:00:00',
    })),
  ];

  const events = await db.insert(eventsTable).values(eventValues).returning();

  console.log(`  ✔ ${PAST_EVENTS} past event(s) and ${FUTURE_EVENTS} future event(s) created`);

  // 8. Stage guests per event (guests can appear in multiple events)
  for (const event of events) {
    const invitationValues = faker.helpers.shuffle([...guestUsers])
      .slice(0, GUESTS_PER_EVENT)
      .map(g => ({
        publicId: crypto.randomUUID(),
        eventId:  event.id,
        userId:   g.id,
      }));
    await db.insert(invitationsTable).values(invitationValues);
  }

  console.log(`  ✔ ${GUESTS_PER_EVENT} staged invitations created per event`);

  // ── filler estate after mock ───────────────────
  await seedFillerEstate(FILLER_AFTER);

  console.log('> Mock data seeding complete.');
}
