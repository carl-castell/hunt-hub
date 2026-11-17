import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accountsTable } from '@/db/schema/accounts';
import { usersTable } from '@/db/schema/users';
import { logError } from '@/utils/logError';

declare global {
  namespace Express {
    interface Request {
      wfsUser?: { id: number; estateId: number };
    }
  }
}

export async function requireWfsAuth(req: Request, res: Response, next: NextFunction) {
  const token =
    (req.query.token as string | undefined) ??
    req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (!token) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="WFS"');
    return res.status(401).type('text/xml').send(wfsException('MissingToken', 'Authorization token required.'));
  }

  try {
    const [row] = await db
      .select({ userId: accountsTable.userId, active: accountsTable.active, role: usersTable.role, estateId: usersTable.estateId })
      .from(accountsTable)
      .innerJoin(usersTable, eq(usersTable.id, accountsTable.userId))
      .where(eq(accountsTable.wfsToken, token))
      .limit(1);

    if (!row || !row.active || row.role !== 'manager' || !row.estateId) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="WFS"');
      return res.status(401).type('text/xml').send(wfsException('InvalidToken', 'Invalid or inactive token.'));
    }

    req.wfsUser = { id: row.userId, estateId: row.estateId };
    next();
  } catch (err) {
    logError('[requireWfsAuth]', err);
    res.status(500).type('text/xml').send(wfsException('InternalError', 'Server error.'));
  }
}

function wfsException(code: string, message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows" version="1.1.0">
  <ows:Exception exceptionCode="${code}">
    <ows:ExceptionText>${message}</ows:ExceptionText>
  </ows:Exception>
</ows:ExceptionReport>`;
}
