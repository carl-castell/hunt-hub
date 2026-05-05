import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLogsTable } from '@/db/schema/audit_logs'
import { usersTable } from '@/db/schema/users'
import { adminProcedure, router } from '../../trpc'

const PAGE_SIZE = 50

export const adminAuditRouter = router({
  list: adminProcedure
    .input(z.object({ page: z.number().int().min(0).default(0) }))
    .query(async ({ input }) => {
      const [{ count }] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(auditLogsTable)

      const rows = await db
        .select({
          id:        auditLogsTable.id,
          event:     auditLogsTable.event,
          ip:        auditLogsTable.ip,
          metadata:  auditLogsTable.metadata,
          createdAt: auditLogsTable.createdAt,
          userId:    auditLogsTable.userId,
          firstName: usersTable.firstName,
          lastName:  usersTable.lastName,
        })
        .from(auditLogsTable)
        .leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id))
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(PAGE_SIZE)
        .offset(input.page * PAGE_SIZE)

      return { rows, total: count, pageSize: PAGE_SIZE }
    }),
})
