import { sql } from 'drizzle-orm';
import { db } from '@/db';
import type { StandDetailsInput } from '@/schemas';
import { resolveStatusDate, UNNAMED_STAND_PREFIX, type StandStatus } from '@/shared/standStatus';

/**
 * Rules for stands, shared by the website (tRPC), the iPhone app (sync push,
 * inside its transaction) and QGIS (WFS-T): own estate only, a number exists
 * once per area, a stand without a number gets "NOT-NAMED-<n>", and the
 * status date follows the status.
 */

export class StandNotFoundError extends Error {
  constructor() {
    super('Stand not found.');
    this.name = 'StandNotFoundError';
  }
}

export class StandNumberTakenError extends Error {
  constructor(public readonly number: string) {
    super(`Stand ${number} already exists in this area.`);
    this.name = 'StandNumberTakenError';
  }
}

/** Anything that runs SQL: the database or an open transaction. */
type Executor = Pick<typeof db, 'execute'>;

/**
 * Locks the area (if it belongs to the estate) until the transaction ends, so
 * two people can't create or rename stands to the same number at once.
 */
export async function lockAreaInEstate(executor: Executor, areaId: number, estateId: number): Promise<boolean> {
  const res = await executor.execute(sql`SELECT id FROM areas WHERE id = ${areaId} AND estate_id = ${estateId} FOR UPDATE`);
  return res.rows.length > 0;
}

/** The stand's area, if the stand belongs to the estate. */
export async function areaOfStand(executor: Executor, standId: number, estateId: number): Promise<number | null> {
  const res = await executor.execute<{ area_id: number }>(sql`
    SELECT s.area_id FROM stands s JOIN areas a ON a.id = s.area_id
    WHERE s.id = ${standId} AND a.estate_id = ${estateId}`);
  return res.rows[0]?.area_id ?? null;
}

export async function numberTaken(executor: Executor, areaId: number, number: string, exceptStandId?: number): Promise<boolean> {
  const res = await executor.execute(sql`
    SELECT 1 FROM stands WHERE area_id = ${areaId} AND number = ${number}
    ${exceptStandId ? sql`AND id <> ${exceptStandId}` : sql``} LIMIT 1`);
  return res.rows.length > 0;
}

/** The next free "NOT-NAMED-<n>" in the area: one higher than the highest in use. */
export async function nextUnnamedNumber(executor: Executor, areaId: number): Promise<string> {
  const pattern = `^${UNNAMED_STAND_PREFIX}[0-9]+$`;
  const res = await executor.execute<{ max: number | null }>(sql`
    SELECT MAX(substring(number FROM ${UNNAMED_STAND_PREFIX.length + 1}::int)::int) AS max
    FROM stands WHERE area_id = ${areaId} AND number ~ ${pattern}`);
  return `${UNNAMED_STAND_PREFIX}${(res.rows[0]?.max ?? 0) + 1}`;
}

/** Whether a point lies outside the area's boundary (false if the area has none). */
export async function outsideArea(executor: Executor, areaId: number, lng: number, lat: number): Promise<boolean> {
  const res = await executor.execute<{ outside: boolean }>(sql`
    SELECT geofile IS NOT NULL AND NOT ST_Covers(geofile, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) AS outside
    FROM areas WHERE id = ${areaId}`);
  return res.rows[0]?.outside ?? false;
}

/** Today's date in Germany (YYYY-MM-DD), where the estates are. */
export function todayInGermany(now = new Date()): string {
  // The sv-SE locale formats dates as YYYY-MM-DD.
  return now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

export type StandDetails = {
  nickname: string | null;
  status: StandStatus | null;
  statusDate: string | null;
};

/**
 * Applies a change of nickname, status or status date to a stand of the
 * estate and returns the stored values. Fields missing from `input` stay as
 * they are. Throws StandNotFoundError for unknown or foreign stands.
 */
export async function updateStandDetails(
  executor: Executor,
  estateId: number,
  standId: number,
  input: StandDetailsInput,
  today = todayInGermany(),
): Promise<StandDetails> {
  const current = await executor.execute<{ nickname: string | null; status: StandStatus | null; status_date: string | null }>(sql`
    SELECT s.nickname, s.status, to_char(s.status_date, 'YYYY-MM-DD') AS status_date
    FROM stands s JOIN areas a ON a.id = s.area_id
    WHERE s.id = ${standId} AND a.estate_id = ${estateId}
    FOR UPDATE OF s`);
  const row = current.rows[0];
  if (!row) throw new StandNotFoundError();

  const nickname = input.nickname === undefined ? row.nickname : input.nickname;
  const status = input.status === undefined ? row.status : input.status;
  const statusDate = resolveStatusDate(row.status, row.status_date, status, input.statusDate, today);

  if (nickname !== row.nickname || status !== row.status || statusDate !== row.status_date) {
    await executor.execute(sql`
      UPDATE stands SET nickname = ${nickname}, status = ${status}, status_date = ${statusDate}
      WHERE id = ${standId}`);
  }
  return { nickname, status, statusDate };
}

type Position = { lng: number; lat: number };

/**
 * A new stand. Without a number it gets the next "NOT-NAMED-<n>". A position
 * outside the boundary is accepted and reported as `outsideArea` (the clients
 * warn before saving). Throws StandNotFoundError if the area isn't the estate's,
 * StandNumberTakenError for a duplicate number. Run inside a transaction.
 */
export async function createStand(
  tx: Executor,
  estateId: number,
  areaId: number,
  input: { number?: string | null; position: Position | null } & StandDetailsInput,
): Promise<{ id: number; number: string; outsideArea: boolean; details: StandDetails | null }> {
  if (!(await lockAreaInEstate(tx, areaId, estateId))) throw new StandNotFoundError();
  const number = input.number?.trim() || (await nextUnnamedNumber(tx, areaId));
  if (await numberTaken(tx, areaId, number)) throw new StandNumberTakenError(number);

  const { position } = input;
  const res = await tx.execute<{ id: number }>(sql`
    INSERT INTO stands (area_id, number, location)
    VALUES (${areaId}, ${number}, ${position ? sql`ST_SetSRID(ST_MakePoint(${position.lng}, ${position.lat}), 4326)` : null})
    RETURNING id`);
  const id = res.rows[0].id;

  const { nickname, status, statusDate } = input;
  const details = nickname || status ? await updateStandDetails(tx, estateId, id, { nickname, status, statusDate }) : null;
  const outside = position ? await outsideArea(tx, areaId, position.lng, position.lat) : false;
  return { id, number, outsideArea: outside, details };
}

/** A new number for a stand; refused if the area already has it. Run inside a transaction. */
export async function renameStand(tx: Executor, estateId: number, standId: number, number: string): Promise<void> {
  const areaId = await areaOfStand(tx, standId, estateId);
  if (areaId === null) throw new StandNotFoundError();
  await lockAreaInEstate(tx, areaId, estateId);
  if (await numberTaken(tx, areaId, number.trim(), standId)) throw new StandNumberTakenError(number.trim());
  await tx.execute(sql`UPDATE stands SET number = ${number.trim()} WHERE id = ${standId}`);
}

/** A new position; returns whether it is outside the boundary (accepted anyway). */
export async function moveStand(executor: Executor, estateId: number, standId: number, position: Position): Promise<{ outsideArea: boolean }> {
  const areaId = await areaOfStand(executor, standId, estateId);
  if (areaId === null) throw new StandNotFoundError();
  await executor.execute(sql`UPDATE stands SET location = ST_SetSRID(ST_MakePoint(${position.lng}, ${position.lat}), 4326) WHERE id = ${standId}`);
  return { outsideArea: await outsideArea(executor, areaId, position.lng, position.lat) };
}

/** Deletes a stand of the estate. A database trigger records it for the iPhone app's sync. */
export async function deleteStand(executor: Executor, estateId: number, standId: number): Promise<void> {
  if ((await areaOfStand(executor, standId, estateId)) === null) throw new StandNotFoundError();
  await executor.execute(sql`DELETE FROM stands WHERE id = ${standId}`);
}
