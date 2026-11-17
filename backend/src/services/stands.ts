import { sql } from 'drizzle-orm';
import { db } from '@/db';
import type { StandDetailsInput } from '@/schemas';
import { resolveStatusDate, type StandStatus } from '@/shared/standStatus';

/**
 * Nickname and status of stands. Used by the website (tRPC), the iPhone app
 * (sync push, inside its transaction) and QGIS (WFS-T), so all three follow
 * the same rules.
 */

export class StandNotFoundError extends Error {
  constructor() {
    super('Stand not found.');
    this.name = 'StandNotFoundError';
  }
}

/** Anything that runs SQL: the database or an open transaction. */
type Executor = Pick<typeof db, 'execute'>;

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
