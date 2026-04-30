import { db } from '@/db';
import { auditLogsTable } from '@/db/schema';

type AuditEvent =
  | 'login'
  | 'failed_login'
  | 'logout'
  | 'account_activated'
  | 'user_created'
  | 'user_deleted'
  | 'user_deactivated'
  | 'user_reactivated'
  | 'user_resend_activation'
  | 'estate_created'
  | 'estate_deleted'
  | 'invitation_email_sent';

interface AuditOptions {
  userId?: number | null;
  event: AuditEvent;
  ip?: string;
  metadata?: Record<string, unknown>;
}

export async function audit({ userId, event, ip, metadata }: AuditOptions) {
  try {
    await db.insert(auditLogsTable).values({
      userId: userId ?? null,
      event,
      ip,
      metadata: metadata ?? null,
    });
  } catch (err) {
    console.error('[audit error]', err);
  }
}
